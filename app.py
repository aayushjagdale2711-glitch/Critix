import os
import json
import socket
import ssl
import time
import logging
import ipaddress
import urllib.parse
from functools import wraps

from flask import Flask, jsonify, render_template, request, make_response
import requests
from bs4 import BeautifulSoup
from groq import Groq
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Configuration & Logging
# ---------------------------------------------------------------------------
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("critixai")

app = Flask(__name__)

# --- API Key (NEVER hard-code secrets) ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
if not GROQ_API_KEY:
    logger.warning(
        "GROQ_API_KEY not set. AI analysis will use fallback. "
        "Set it in your .env file."
    )

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Use a real, available Groq model
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# --- Production flags ---
IS_PRODUCTION = os.getenv("FLASK_ENV", "development") == "production"
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "10"))
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB

app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------
def add_security_headers(response):
    """Attach defensive HTTP headers to every response."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
    return response


app.after_request(add_security_headers)


def is_private_ip(ip_str: str) -> bool:
    """Return True if the IP belongs to a private / loopback / reserved range."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return addr.is_private or addr.is_loopback or addr.is_reserved or addr.is_link_local
    except ValueError:
        return True  # unparseable → treat as unsafe


def validate_url_safe(target_url: str) -> str:
    """
    Validate and normalise a user-supplied URL.
    Raises ValueError on anything suspicious (SSRF guard).
    """
    if not target_url.startswith(("http://", "https://")):
        target_url = "https://" + target_url

    parsed = urllib.parse.urlparse(target_url)
    hostname = parsed.hostname

    if not hostname:
        raise ValueError("Invalid URL: could not extract hostname.")

    # Block obvious internal targets
    if hostname.lower() in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"):
        raise ValueError("Requests to internal addresses are not allowed.")

    # Resolve DNS and check for private IPs (SSRF mitigation)
    try:
        resolved_ip = socket.gethostbyname(hostname)
        if is_private_ip(resolved_ip):
            raise ValueError("Requests to private network addresses are not allowed.")
    except socket.gaierror:
        raise ValueError(f"Could not resolve hostname: {hostname}")

    return target_url


# ---------------------------------------------------------------------------
# Network / scraping helpers
# ---------------------------------------------------------------------------
def check_ssl(hostname: str):
    """Verify whether the domain presents a valid TLS certificate."""
    context = ssl.create_default_context()
    try:
        with socket.create_connection((hostname, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                ssock.getpeercert()
                return True, "Valid SSL/TLS certificate detected"
    except ssl.SSLCertVerificationError as e:
        return False, f"SSL certificate verification failed: {e.reason}"
    except ssl.SSLError as e:
        return False, f"SSL error: {e.reason}"
    except Exception:
        return False, "SSL/TLS connection could not be established."


def get_ip_address(hostname: str) -> str:
    try:
        return socket.gethostbyname(hostname)
    except socket.gaierror:
        return "Unknown"


def analyze_security_headers(headers):
    """Check for defensive security response headers."""
    expected = {
        "Strict-Transport-Security": "HSTS enforced (HTTPS-only)",
        "Content-Security-Policy": "CSP active (mitigates XSS)",
        "X-Frame-Options": "Clickjacking protection enabled",
        "X-Content-Type-Options": "MIME-sniffing blocked",
    }
    results, missing = [], 0
    for hdr, desc in expected.items():
        if hdr in headers:
            results.append({"icon": "🛡️", "name": hdr, "desc": desc, "status": "safe"})
        else:
            missing += 1
            results.append({
                "icon": "⚠️",
                "name": hdr,
                "desc": f"Missing header: {hdr}",
                "status": "warning",
            })
    return results, missing


def extract_website_content(soup, max_chars=3000) -> str:
    """Pull meaningful text from the parsed HTML."""
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()

    parts = []
    for h in soup.find_all(["h1", "h2", "h3"], limit=10):
        t = h.get_text(strip=True)
        if t:
            parts.append(t)
    for p in soup.find_all("p", limit=15):
        t = p.get_text(strip=True)
        if t and len(t) > 20:
            parts.append(t)
    return " ".join(parts)[:max_chars]


# ---------------------------------------------------------------------------
# Groq AI helpers
# ---------------------------------------------------------------------------
def _call_groq(system_msg: str, user_msg: str, max_tokens: int = 1500) -> dict | None:
    """Single point of contact with the Groq API. Returns parsed JSON or None."""
    if groq_client is None:
        logger.warning("Groq client not initialised – skipping AI call.")
        return None

    try:
        resp = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.35,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        text = resp.choices[0].message.content.strip()

        # Strip markdown fences if the model wraps anyway
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        return json.loads(text)

    except json.JSONDecodeError as exc:
        logger.error("JSON parse error from Groq: %s", exc)
    except Exception as exc:
        logger.error("Groq API error: %s", exc)
    return None


def generate_ai_analysis(hostname, title, meta_desc, content, technical_data):
    prompt = f"""Analyse this website and return ONLY valid JSON (no markdown).

DOMAIN: {hostname}
TITLE: {title}
META DESC: {meta_desc}
TECHNICAL: {json.dumps(technical_data)}
CONTENT: {content[:2000]}

JSON schema:
{{
  "name": "Brand name",
  "description": "2-3 sentence description",
  "category": "Category",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "pros": ["pro1","pro2","pro3","pro4","pro5"],
  "cons": ["con1","con2","con3","con4"],
  "popularity_estimate": 75,
  "trust_assessment": 80,
  "summary": "3-4 sentence summary",
  "verdict_message": "Short recommendation"
}}
Scores must be integers 0-100."""

    return _call_groq(
        "You are a precise web-analysis AI. Respond with valid JSON only.",
        prompt,
        max_tokens=1500,
    )


def generate_ai_comparison(site_a, site_b):
    prompt = f"""Compare these two websites. Return ONLY valid JSON.

SITE A: {site_a['name']} ({site_a['details']['Domain']}) score={site_a['overallScore']}
SITE B: {site_b['name']} ({site_b['details']['Domain']}) score={site_b['overallScore']}

JSON:
{{
  "winner": "Name or 'Tie'",
  "summary": "3-4 sentence comparison",
  "insights": "Strategic takeaways"
}}"""

    result = _call_groq(
        "You are a comparison analyst. Respond with valid JSON only.",
        prompt,
        max_tokens=800,
    )
    if result:
        return result
    return {
        "winner": site_a["name"] if site_a["overallScore"] >= site_b["overallScore"] else site_b["name"],
        "summary": f"Comparison complete between {site_a['name']} and {site_b['name']}.",
        "insights": "Both sites show distinct strengths.",
    }


def fallback_analysis(hostname, title, meta_desc):
    return {
        "name": hostname.split(".")[0].capitalize(),
        "description": meta_desc or f"Website at {hostname}",
        "category": "Website",
        "tags": ["Web", "Online"],
        "pros": ["Site is online and reachable", "Content delivered successfully"],
        "cons": ["AI analysis unavailable", "Limited data for deep review"],
        "popularity_estimate": 50,
        "trust_assessment": 50,
        "summary": f"Basic analysis of {hostname}. AI insights unavailable.",
        "verdict_message": "Exercise standard caution",
    }


# ---------------------------------------------------------------------------
# Core analysis pipeline
# ---------------------------------------------------------------------------
def process_single_url(raw_url: str) -> dict:
    """Fetch, parse, score, and (optionally) AI-analyse a single URL."""
    target_url = validate_url_safe(raw_url.strip())
    parsed = urllib.parse.urlparse(target_url)
    hostname = parsed.hostname or ""
    is_https = target_url.startswith("https")

    # --- SSL ---
    ssl_ok, ssl_desc = (check_ssl(hostname) if is_https else (False, "HTTP – no encryption"))

    # --- Fetch page ---
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    start = time.time()
    try:
        resp = requests.get(
            target_url,
            headers=headers,
            timeout=REQUEST_TIMEOUT,
            allow_redirects=True,
        )
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        raise ValueError(f"Request to {hostname} timed out after {REQUEST_TIMEOUT}s.")
    except requests.exceptions.ConnectionError:
        raise ValueError(f"Could not connect to {hostname}.")
    except requests.exceptions.HTTPError as exc:
        raise ValueError(f"HTTP error {resp.status_code} from {hostname}.")
    except requests.RequestException as exc:
        raise ValueError(f"Request failed: {exc}")

    response_time_ms = int((time.time() - start) * 1000)

    # --- Parse HTML ---
    soup = BeautifulSoup(resp.text, "html.parser")
    title = soup.title.string.strip() if soup.title and soup.title.string else hostname
    meta_tag = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    meta_desc = meta_tag["content"].strip() if meta_tag and meta_tag.get("content") else ""

    content = extract_website_content(soup)
    sec_headers, missing_hdrs = analyze_security_headers(resp.headers)

    # --- Scores ---
    safety = 50 + (15 if is_https else 0) + (15 if ssl_ok else 0) + (4 - missing_hdrs) * 5
    safety = min(max(safety, 0), 100)

    speed = max(min(100 - response_time_ms // 30, 100), 10)

    # --- AI ---
    tech = {
        "https": is_https,
        "ssl_valid": ssl_ok,
        "response_time_ms": response_time_ms,
        "server": resp.headers.get("Server", "Unknown"),
        "ip": get_ip_address(hostname),
        "has_meta": bool(meta_desc),
    }
    ai = generate_ai_analysis(hostname, title, meta_desc, content, tech) or fallback_analysis(
        hostname, title, meta_desc
    )

    trust = ai.get("trust_assessment", 50)
    popularity = ai.get("popularity_estimate", 50)
    overall = int(safety * 0.35 + trust * 0.30 + speed * 0.20 + popularity * 0.15)

    verdict_type = "safe" if overall >= 80 else ("caution" if overall >= 55 else "unsafe")

    return {
        "name": ai.get("name", hostname.split(".")[0].capitalize()),
        "description": ai.get("description", meta_desc),
        "tags": ai.get("tags", ["Web"]),
        "overallScore": overall,
        "scores": {"safety": safety, "trust": trust, "speed": speed, "popularity": popularity},
        "pros": ai.get("pros", []),
        "cons": ai.get("cons", []),
        "details": {
            "Domain": hostname,
            "IP Address": tech["ip"],
            "Protocol": "HTTPS (Secure)" if is_https else "HTTP (Unencrypted)",
            "Response Time": f"{response_time_ms} ms",
            "Server": tech["server"],
            "Page Size": f"{len(resp.content) // 1024} KB",
            "Category": ai.get("category", "Website"),
            "SSL Valid": "Yes" if ssl_ok else "No",
        },
        "security": [
            {
                "icon": "🔒" if ssl_ok else "🔓",
                "name": "SSL Certificate",
                "desc": ssl_desc,
                "status": "safe" if ssl_ok else "danger",
            }
        ] + sec_headers,
        "summary": ai.get("summary", ""),
        "verdictType": verdict_type,
        "verdictMessage": ai.get("verdict_message", "Analysis complete"),
        "aiPowered": groq_client is not None,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True)
    if not data or not data.get("url", "").strip():
        return jsonify({"success": False, "error": "No URL provided."}), 400

    url = data["url"].strip()
    if len(url) > 2048:
        return jsonify({"success": False, "error": "URL too long."}), 400

    try:
        result = process_single_url(url)
        return jsonify({"success": True, "data": result})
    except ValueError as exc:
        logger.warning("Validation error: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.exception("Unexpected error during analysis")
        return jsonify({"success": False, "error": "Internal server error."}), 500


@app.route("/api/compare", methods=["POST"])
def compare():
    data = request.get_json(silent=True)
    if not data or not data.get("urlA", "").strip() or not data.get("urlB", "").strip():
        return jsonify({"success": False, "error": "Two URLs are required."}), 400

    try:
        site_a = process_single_url(data["urlA"])
        site_b = process_single_url(data["urlB"])
        comparison = generate_ai_comparison(site_a, site_b)
        return jsonify({"success": True, "data": {"siteA": site_a, "siteB": site_b, "comparison": comparison}})
    except ValueError as exc:
        logger.warning("Validation error: %s", exc)
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.exception("Unexpected error during comparison")
        return jsonify({"success": False, "error": "Internal server error."}), 500


@app.route("/api/health")
def health():
    groq_ok = False
    if groq_client:
        try:
            groq_client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": "OK"}],
                max_tokens=3,
            )
            groq_ok = True
        except Exception:
            pass
    status = "healthy" if groq_ok else "degraded"
    code = 200 if groq_ok else 200  # still 200; frontend can check groq_connected
    return jsonify({"status": status, "groq_connected": groq_ok, "model": GROQ_MODEL}), code


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logger.info("CritixAI starting – model=%s", GROQ_MODEL)
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", 5000)),
        debug=not IS_PRODUCTION,   # ← debug OFF in production
    )