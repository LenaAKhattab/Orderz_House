#!/usr/bin/env python3
"""Phase 5F-SMOKE — Auth-first runtime smoke QA (read-only, no code changes)."""
from __future__ import annotations

import html
import os
import re
import subprocess
import sys
import time

ADB = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
PKG = "com.orderzhouse.orderzhouse_app"
OUTDIR = r"c:\Users\acer\OneDrive\Desktop\Orderz_House\mobile\orderzhouse_app\_smoke_qa"
RESULTS: dict[str, object] = {}


def sh(*args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [ADB, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=check,
    )


def dump(name: str) -> str:
    sh("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    p = sh("exec-out", "cat", "/sdcard/ui.xml")
    path = os.path.join(OUTDIR, f"{name}.xml")
    with open(path, "w", encoding="utf-8") as f:
        f.write(p.stdout)
    return p.stdout


def texts(xml: str) -> list[str]:
    out: list[str] = []
    for m in re.finditer(r'(?:text|content-desc)="([^"]*)"', xml):
        t = html.unescape(m.group(1)).strip()
        if t:
            out.append(t)
    seen: set[str] = set()
    res: list[str] = []
    for t in out:
        if t not in seen:
            seen.add(t)
            res.append(t)
    return res


def tap_containing(xml: str, needle: str) -> bool:
    for m in re.finditer(r"<node[^>]+>", xml):
        s = m.group(0)
        decoded = html.unescape(s)
        if needle not in decoded:
            continue
        bm = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
        if not bm:
            continue
        x = (int(bm.group(1)) + int(bm.group(3))) // 2
        y = (int(bm.group(2)) + int(bm.group(4))) // 2
        print(f"TAP {needle!r} -> {x},{y}")
        sh("shell", "input", "tap", str(x), str(y))
        return True
    print(f"TAP FAIL {needle!r}")
    return False


def show(label: str, xml: str) -> str:
    print(f"==== {label} ====")
    ts = texts(xml)
    for t in ts:
        print(" -", t.replace("\n", " / "))
    joined = " | ".join(ts)
    flags = {
        "HAS_LOGIN": any(x in joined for x in ["تسجيل الدخول", "مرحباً بعودتك"]),
        "HAS_REGISTER_CTA": "إنشاء حساب" in joined,
        "HAS_CREATE_ACCOUNT_SCREEN": "إنشاء حساب" in joined and "البريد" in joined or "firstName" in xml.lower(),
        "HAS_BOTTOM_NAV": any(x in joined for x in ["الرئيسية", "الخدمات", "طلباتي", "حسابي"]),
        "HAS_GUEST_BROWSE": any(
            x in joined for x in ["تصفح سوق الطلبات", "الدخول كضيف", "تصفح السوق أو سجّل"]
        ),
        "HAS_HOME_CLIENT": "أنجز طلباتك باحتراف" in joined or "إنشاء طلب جديد" in joined,
        "HAS_FREELANCER": any(x in joined for x in ["تصفح سوق الطلبات", "الباقات", "المطالبات"]),
        "HAS_LOGOUT_CONFIRM": "هل تريد تسجيل الخروج" in joined,
        "HAS_PAYMENT_GUEST": "تسجيل الدخول لتأكيد الدفع" in joined or "تأكيد حالة الدفع" in joined,
    }
    # refine create account screen: AppBar title إنشاء حساب + form fields
    if "كلمة المرور" in joined and "إنشاء حساب" in joined and "مرحباً بعودتك" not in joined:
        flags["HAS_CREATE_ACCOUNT_SCREEN"] = True
    if "مرحباً بعودتك" in joined:
        flags["HAS_CREATE_ACCOUNT_SCREEN"] = False
    for k, v in flags.items():
        print(f" {k}: {v}")
    RESULTS[label] = {"texts": ts, "flags": flags}
    return joined


def launch_fresh() -> None:
    sh("shell", "am", "force-stop", PKG)
    time.sleep(0.5)
    sh("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")
    time.sleep(5)


def fill_login(email: str, password: str) -> None:
    """Tap email field, type; tap password; type; submit."""
    xml = dump("tmp_login_form")
    # EditTexts are clickable with empty content-desc often — find by password=true / class
    edits = list(re.finditer(r'<node[^>]*class="android.widget.EditText"[^>]*>', xml))
    if len(edits) < 2:
        # Flutter sometimes exposes as other classes
        edits = [
            m
            for m in re.finditer(r"<node[^>]+>", xml)
            if 'clickable="true"' in m.group(0) and "EditText" in m.group(0)
        ]
    print(f"EditText nodes: {len(edits)}")
    coords = []
    for m in edits:
        bm = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', m.group(0))
        if bm:
            coords.append(
                (
                    (int(bm.group(1)) + int(bm.group(3))) // 2,
                    (int(bm.group(2)) + int(bm.group(4))) // 2,
                )
            )
    if len(coords) < 2:
        # fallback approximate positions from earlier dumps
        print("WARN: using fallback field coords")
        coords = [(540, 980), (540, 1180)]
    # email
    sh("shell", "input", "tap", str(coords[0][0]), str(coords[0][1]))
    time.sleep(0.4)
    sh("shell", "input", "text", email.replace("@", "%40"))
    time.sleep(0.4)
    # password
    sh("shell", "input", "tap", str(coords[1][0]), str(coords[1][1]))
    time.sleep(0.4)
    # adb input text doesn't like ! well — use keyevents via escaped or clipboard
    # Prefer `adb shell input text` with escaped specials; '!' is OK sometimes with quotes
    sh("shell", "input", "text", password.replace("!", "\\!").replace("@", "%40"))
    time.sleep(0.5)
    # Prefer clipboard for complex password
    # Actually use app_process / service call — simpler: use run-as? 
    # Use `adb shell am broadcast` — skip, try input text raw
    tap_containing(dump("tmp_before_submit"), "تسجيل الدخول")
    # If login button also matches header, tap the clickable button specifically
    time.sleep(4)


def set_clipboard_and_paste(text: str) -> None:
    # Not reliable on all emulators; keep as helper
    pass


def login_via_adb_keyboard(email: str, password: str) -> bool:
    xml = dump("login_fields")
    show("LOGIN_BEFORE_FILL", xml)
    edits = []
    for m in re.finditer(r"<node[^>]+>", xml):
        s = m.group(0)
        if "EditText" not in s and 'password="true"' not in s:
            # Flutter semantics: look for clickable focused fields near labels
            continue
        bm = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
        if not bm:
            continue
        edits.append(
            {
                "password": 'password="true"' in s,
                "x": (int(bm.group(1)) + int(bm.group(3))) // 2,
                "y": (int(bm.group(2)) + int(bm.group(4))) // 2,
                "s": s[:120],
            }
        )
    print("FIELDS:", edits)
    if len(edits) < 2:
        # try all clickable nodes with empty text that look like fields (tall enough)
        fields = []
        for m in re.finditer(r"<node[^>]+>", xml):
            s = m.group(0)
            if 'clickable="true"' not in s:
                continue
            bm = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
            if not bm:
                continue
            x1, y1, x2, y2 = map(int, bm.groups())
            h = y2 - y1
            w = x2 - x1
            if h < 80 or w < 400:
                continue
            if "Button" in s or "تسجيل" in html.unescape(s) or "إنشاء" in html.unescape(s):
                continue
            fields.append(((x1 + x2) // 2, (y1 + y2) // 2, 'password="true"' in s, s))
        print("CLICKABLE FIELD CANDIDATES:", [(f[0], f[1], f[2]) for f in fields])
        if len(fields) >= 2:
            edits = [
                {"password": fields[0][2], "x": fields[0][0], "y": fields[0][1]},
                {"password": fields[1][2], "x": fields[1][0], "y": fields[1][1]},
            ]
        else:
            return False

    email_field = next((e for e in edits if not e["password"]), edits[0])
    pass_field = next((e for e in edits if e["password"]), edits[-1])

    sh("shell", "input", "tap", str(email_field["x"]), str(email_field["y"]))
    time.sleep(0.3)
    # Clear existing
    sh("shell", "input", "keyevent", "KEYCODE_CTRL_LEFT", "KEYCODE_A")
    sh("shell", "input", "keyevent", "67")  # DEL
    # Type email — adb input text: space not allowed; @ as %40
    sh("shell", "input", "text", email.replace("@", "%40").replace(" ", "%s"))
    time.sleep(0.3)

    sh("shell", "input", "tap", str(pass_field["x"]), str(pass_field["y"]))
    time.sleep(0.3)
    sh("shell", "input", "keyevent", "KEYCODE_CTRL_LEFT", "KEYCODE_A")
    sh("shell", "input", "keyevent", "67")
    # Password Test123456! — escape for shell
    # Use cmd: adb shell input text 'Test123456!'
    subprocess.run(
        [ADB, "shell", "input", "text", "Test123456!"],
        capture_output=True,
        text=True,
    )
    time.sleep(0.4)

    # Tap login button (clickable content-desc تسجيل الدخول)
    xml2 = dump("before_login_tap")
    tapped = False
    for m in re.finditer(r"<node[^>]+>", xml2):
        s = m.group(0)
        if "تسجيل الدخول" not in html.unescape(s):
            continue
        if 'clickable="true"' not in s:
            continue
        bm = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
        if not bm:
            continue
        x = (int(bm.group(1)) + int(bm.group(3))) // 2
        y = (int(bm.group(2)) + int(bm.group(4))) // 2
        print(f"TAP login button -> {x},{y}")
        sh("shell", "input", "tap", str(x), str(y))
        tapped = True
        break
    if not tapped:
        tap_containing(xml2, "تسجيل الدخول")
    time.sleep(5)
    return True


def open_deep_link(uri: str) -> None:
    print(f"DEEP LINK: {uri}")
    sh(
        "shell",
        "am",
        "start",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        uri,
        PKG,
    )
    time.sleep(3)


def tap_nav(label: str) -> bool:
    return tap_containing(dump("nav"), label)


def main() -> int:
    os.makedirs(OUTDIR, exist_ok=True)
    print("ADB devices:")
    print(sh("devices").stdout)

    # --- 1 Fresh install already done; relaunch ---
    launch_fresh()
    xml = dump("01_fresh_login")
    show("01_FRESH_INSTALL", xml)
    RESULTS["fresh_goes_to_login"] = RESULTS["01_FRESH_INSTALL"]["flags"]["HAS_LOGIN"]  # type: ignore
    RESULTS["bottom_nav_hidden"] = not RESULTS["01_FRESH_INSTALL"]["flags"]["HAS_BOTTOM_NAV"]  # type: ignore
    RESULTS["guest_browse_gone"] = not RESULTS["01_FRESH_INSTALL"]["flags"]["HAS_GUEST_BROWSE"]  # type: ignore

    # --- 3 Register ---
    ok = tap_containing(xml, "إنشاء حساب")
    time.sleep(2)
    xml = dump("02_register")
    show("02_REGISTER", xml)
    RESULTS["register_opens"] = RESULTS["02_REGISTER"]["flags"].get("HAS_CREATE_ACCOUNT_SCREEN") or (  # type: ignore
        "إنشاء حساب" in " | ".join(RESULTS["02_REGISTER"]["texts"])  # type: ignore
        and "مرحباً بعودتك" not in " | ".join(RESULTS["02_REGISTER"]["texts"])  # type: ignore
    )
    sh("shell", "input", "keyevent", "4")
    time.sleep(2)
    xml = dump("03_back_login")
    show("03_BACK_LOGIN", xml)
    RESULTS["register_back_ok"] = RESULTS["03_BACK_LOGIN"]["flags"]["HAS_LOGIN"]  # type: ignore
    RESULTS["no_auth_loop"] = RESULTS["register_back_ok"] and RESULTS["register_opens"]

    # --- 2 Protected routes via payment-style / try flutter deep link ---
    # App only has orderzhouse://payment intent filter. For in-app routes, use:
    # adb shell am start -n ... then hope go_router — not available.
    # Alternative: after login we'll verify; while logged out, force payment return deep link.
    open_deep_link(
        "orderzhouse://payment/return?status=success&orderId=999999&session_id=cs_test_smoke"
    )
    xml = dump("04_payment_guest")
    show("04_PAYMENT_RETURN_GUEST", xml)
    RESULTS["payment_return_guest_login"] = RESULTS["04_PAYMENT_RETURN_GUEST"]["flags"]["HAS_PAYMENT_GUEST"] or (  # type: ignore
        RESULTS["04_PAYMENT_RETURN_GUEST"]["flags"]["HAS_LOGIN"]  # type: ignore
    )
    # Ensure not home guest browsing
    RESULTS["payment_not_guest_home"] = not RESULTS["04_PAYMENT_RETURN_GUEST"]["flags"]["HAS_GUEST_BROWSE"]  # type: ignore
    RESULTS["payment_no_bottom_nav"] = not RESULTS["04_PAYMENT_RETURN_GUEST"]["flags"]["HAS_BOTTOM_NAV"]  # type: ignore

    # Back to login for client login
    if RESULTS["04_PAYMENT_RETURN_GUEST"]["flags"]["HAS_PAYMENT_GUEST"]:  # type: ignore
        # tap plain login or login to confirm
        tap_containing(xml, "تسجيل الدخول")
        time.sleep(2)
    launch_fresh()
    time.sleep(2)

    # --- 4 Client login ---
    # Verify API reachable from host (emulator uses 10.0.2.2)
    import urllib.request

    try:
        with urllib.request.urlopen("http://127.0.0.1:5000/api/health", timeout=5) as r:
            health = r.read().decode()
            print("API health:", health)
            RESULTS["api_ok"] = "API is running" in health
    except Exception as e:
        print("API health FAIL", e)
        RESULTS["api_ok"] = False

    login_via_adb_keyboard("qa.client@orderzhouse.test", "Test123456!")
    xml = dump("05_client_home")
    show("05_CLIENT_LOGIN", xml)
    RESULTS["client_login"] = (
        RESULTS["05_CLIENT_LOGIN"]["flags"]["HAS_HOME_CLIENT"]  # type: ignore
        or RESULTS["05_CLIENT_LOGIN"]["flags"]["HAS_BOTTOM_NAV"]  # type: ignore
    ) and not RESULTS["05_CLIENT_LOGIN"]["flags"]["HAS_LOGIN"]  # type: ignore

    if RESULTS["client_login"]:
        # bottom nav visible
        RESULTS["client_bottom_nav"] = RESULTS["05_CLIENT_LOGIN"]["flags"]["HAS_BOTTOM_NAV"]  # type: ignore
        # Try protected route labels via nav
        tap_nav("الخدمات")
        time.sleep(2)
        show("05b_SERVICES", dump("05b_services"))
        tap_nav("حسابي")
        time.sleep(2)
        xml = dump("06_profile")
        show("06_PROFILE", xml)

        # Logout
        tap_containing(xml, "تسجيل الخروج")
        time.sleep(1)
        xml = dump("07_logout_confirm")
        show("07_LOGOUT_CONFIRM", xml)
        RESULTS["logout_confirm"] = RESULTS["07_LOGOUT_CONFIRM"]["flags"]["HAS_LOGOUT_CONFIRM"]  # type: ignore
        # confirm button
        for m in re.finditer(r"<node[^>]+>", xml):
            s = m.group(0)
            if "تسجيل الخروج" in html.unescape(s) and 'clickable="true"' in s:
                # prefer the dialog confirm (FilledButton) — often last
                pass
        # tap all clickable تسجيل الخروج and pick bottom-most
        candidates = []
        for m in re.finditer(r"<node[^>]+>", xml):
            s = m.group(0)
            if "تسجيل الخروج" not in html.unescape(s):
                continue
            if 'clickable="true"' not in s:
                continue
            bm = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
            if not bm:
                continue
            y = (int(bm.group(2)) + int(bm.group(4))) // 2
            x = (int(bm.group(1)) + int(bm.group(3))) // 2
            candidates.append((y, x))
        candidates.sort()
        if candidates:
            y, x = candidates[-1]
            print(f"CONFIRM LOGOUT tap {x},{y}")
            sh("shell", "input", "tap", str(x), str(y))
        time.sleep(3)
        xml = dump("08_after_logout")
        show("08_AFTER_LOGOUT", xml)
        RESULTS["logout_to_login"] = RESULTS["08_AFTER_LOGOUT"]["flags"]["HAS_LOGIN"]  # type: ignore

        # Back should not return to home
        sh("shell", "input", "keyevent", "4")
        time.sleep(2)
        xml = dump("09_back_after_logout")
        show("09_BACK_AFTER_LOGOUT", xml)
        joined = " | ".join(RESULTS["09_BACK_AFTER_LOGOUT"]["texts"])  # type: ignore
        RESULTS["back_no_home"] = (
            RESULTS["09_BACK_AFTER_LOGOUT"]["flags"]["HAS_LOGIN"]  # type: ignore
            or "أوردرز هاوس" not in joined
            or RESULTS["09_BACK_AFTER_LOGOUT"]["flags"]["HAS_LOGIN"]  # type: ignore
        )
        # If left app to launcher, that's also OK (not home)
        if "Play Store" in joined or "Chrome" in joined:
            RESULTS["back_no_home"] = True
            RESULTS["back_exited_app"] = True
        else:
            RESULTS["back_exited_app"] = False
            RESULTS["back_no_home"] = not (
                RESULTS["09_BACK_AFTER_LOGOUT"]["flags"]["HAS_HOME_CLIENT"]  # type: ignore
                or RESULTS["09_BACK_AFTER_LOGOUT"]["flags"]["HAS_BOTTOM_NAV"]  # type: ignore
            )
    else:
        RESULTS["client_bottom_nav"] = False
        RESULTS["logout_confirm"] = None
        RESULTS["logout_to_login"] = None
        RESULTS["back_no_home"] = None
        print("CLIENT LOGIN FAILED — skip logout/freelancer if stuck")

    # --- 6 Freelancer login ---
    launch_fresh()
    time.sleep(2)
    login_via_adb_keyboard("qa.freelancer@orderzhouse.test", "Test123456!")
    xml = dump("10_freelancer")
    show("10_FREELANCER_LOGIN", xml)
    RESULTS["freelancer_login"] = (
        RESULTS["10_FREELANCER_LOGIN"]["flags"]["HAS_BOTTOM_NAV"]  # type: ignore
        or RESULTS["10_FREELANCER_LOGIN"]["flags"]["HAS_FREELANCER"]  # type: ignore
    ) and not RESULTS["10_FREELANCER_LOGIN"]["flags"]["HAS_LOGIN"]  # type: ignore

    # Print summary
    print("\n======== SMOKE SUMMARY ========")
    keys = [
        "fresh_goes_to_login",
        "bottom_nav_hidden",
        "guest_browse_gone",
        "register_opens",
        "register_back_ok",
        "no_auth_loop",
        "payment_return_guest_login",
        "payment_not_guest_home",
        "payment_no_bottom_nav",
        "api_ok",
        "client_login",
        "client_bottom_nav",
        "logout_confirm",
        "logout_to_login",
        "back_no_home",
        "freelancer_login",
    ]
    for k in keys:
        print(f"{k}: {RESULTS.get(k)}")

    # Write summary file
    with open(os.path.join(OUTDIR, "summary.txt"), "w", encoding="utf-8") as f:
        for k in keys:
            f.write(f"{k}: {RESULTS.get(k)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
