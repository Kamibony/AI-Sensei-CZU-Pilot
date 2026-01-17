import json
import os
import sys

# Configuration
LOCALE_CS = 'public/locales/cs.json'
LOCALE_PT = 'public/locales/pt-br.json'

def load_json(path):
    if not os.path.exists(path):
        print(f"❌ Error: File not found: {path}")
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ Error decoding JSON in {path}: {e}")
        return {}

def flatten_json(y):
    out = {}
    def flatten(x, name=''):
        if type(x) is dict:
            for a in x:
                flatten(x[a], name + a + '.')
        else:
            out[name[:-1]] = x
    flatten(y)
    return out

def verify_localization():
    print(f"🔍 Verifying localization parity between {LOCALE_CS} and {LOCALE_PT}...")

    cs_data = load_json(LOCALE_CS)
    pt_data = load_json(LOCALE_PT)

    if not cs_data or not pt_data:
        print("❌ Failed to load one or both localization files.")
        return False

    cs_flat = flatten_json(cs_data)
    pt_flat = flatten_json(pt_data)

    cs_keys = set(cs_flat.keys())
    pt_keys = set(pt_flat.keys())

    missing_in_pt = cs_keys - pt_keys
    missing_in_cs = pt_keys - cs_keys

    success = True

    if missing_in_pt:
        print(f"\n❌ Missing {len(missing_in_pt)} keys in PT-BR (present in CS):")
        for key in sorted(missing_in_pt):
            print(f"   - {key}")
        success = False
    else:
        print("\n✅ All CS keys are present in PT-BR.")

    if missing_in_cs:
        print(f"\n⚠️  Warning: {len(missing_in_cs)} keys in PT-BR are missing in CS (extra keys?):")
        for key in sorted(missing_in_cs):
            print(f"   - {key}")
        # This is a warning, not necessarily a failure, but parity implies they should match.
        # However, for this task, the goal is ensuring PT has what CS has (and specifically the manual additions).

    if success:
        print("\n🎉 Localization verification passed!")
    else:
        print("\n🔥 Localization verification FAILED.")

    return success

if __name__ == "__main__":
    if verify_localization():
        sys.exit(0)
    else:
        sys.exit(1)
