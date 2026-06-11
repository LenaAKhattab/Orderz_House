import re
from collections import Counter
import importlib.util
spec = importlib.util.spec_from_file_location("build", "_build_v2_design_50.py")
# load without executing main - patch __file__
import sys
sys.path.insert(0, ".")
code = open("_build_v2_design_50.py", encoding="utf-8").read().replace(
    "Path(__file__)", 'Path("_build_v2_design_50.py")'
)
ns = {}
exec(code.split("if __name__")[0], ns)
ORDERS = ns["ORDERS"]
wc = lambda t: len(re.findall(r"[\u0600-\u06FF]+", t))
subs = [o[2] for o in ORDERS]
print("count", len(ORDERS))
print("unique subs", len(set(subs)))
for s, c in Counter(subs).items():
    if c > 1:
        print("DUP", c, s)
for i, o in enumerate(ORDERS, 1):
    w = wc(o[8])
    tier = o[7]
    mins = {"micro": 80, "medium": 150, "large": 250, "small": 80}[tier]
    if w < mins:
        print(f"SHORT #{i} {tier} {w} {o[1][:50]}")
