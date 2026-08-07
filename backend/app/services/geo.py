import logging
import ipaddress
import geoip2.database
from pathlib import Path
from app.config import get_settings

log = logging.getLogger(__name__)

# Cache reader instance
_reader = None

def _get_reader():
    global _reader
    if _reader is not None:
        return _reader
        
    settings = get_settings()
    db_path = getattr(settings, "geoip_db_path", "data/GeoLite2-City.mmdb")
    path = Path(db_path)
    
    # Try absolute or relative to backend root
    if not path.is_absolute():
        backend_root = Path(__file__).resolve().parents[2]
        path = backend_root / path
        
    if path.exists():
        try:
            _reader = geoip2.database.Reader(str(path))
        except Exception as e:
            log.error("Failed to open GeoIP database at %s: %s", path, e)
    else:
        log.warning("GeoIP database not found at %s. To enable real location data, register for a MaxMind license key, download GeoLite2-City.mmdb, and place it at this path.", path)
        
    return _reader

def get_location(ip: str) -> dict:
    default_loc = {"location": None, "latitude": None, "longitude": None}
    
    if not ip or ip == "127.0.0.1":
        return default_loc
        
    try:
        ip_obj = ipaddress.ip_address(ip)
        if ip_obj.is_private:
            return default_loc
    except ValueError:
        return default_loc

    reader = _get_reader()
    if not reader:
        return default_loc
        
    try:
        response = reader.city(ip)
        city = response.city.name or ""
        country = response.country.name or ""
        loc_str = f"{city}, {country}".strip(", ")
        
        return {
            "location": loc_str if loc_str else None,
            "latitude": response.location.latitude,
            "longitude": response.location.longitude
        }
    except geoip2.errors.AddressNotFoundError:
        return default_loc
    except Exception as e:
        log.error("Error looking up IP %s: %s", ip, e)
        return default_loc
