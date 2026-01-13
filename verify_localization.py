import json
import os
import re

# Konfigurácia
LOCALE_CS = 'public/locales/cs.json'
LOCALE_PT = 'public/locales/pt-br.json'
JS_DIR = 'public/js'

def load_json(path):
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

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

def check_locales():
    print("--- Kontrola JSON súborov ---")
    cs_keys = set(flatten_json(load_json(LOCALE_CS)).keys())
    pt_keys = set(flatten_json(load_json(LOCALE_PT)).keys())
    missing = cs_keys - pt_keys
    if missing:
        print(f"❌ V PT-BR chýba {len(missing)} kľúčov (napr. {list(missing)[:3]}...)")
    else:
        print("✅ Štruktúra kľúčov je identická.")

def check_hardcoded_strings():
    print("\n--- Kontrola Hardcoded Češtiny v JS ---")
    # Hľadá typické české reťazce v kóde
    cz_pattern = re.compile(r'(["\'`])(.*?Např\..*?|.*?Vytvoř.*?|.*?Vytvor.*?|.*?Manuálně.*?|.*?Magicky.*?)\1')
    for root, _, files in os.walk(JS_DIR):
        for file in files:
            if file.endswith(".js"):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    matches = cz_pattern.findall(f.read())
                    if matches:
                        print(f"⚠️ {file}: Našiel som podozrivé texty:")
                        for _, txt in matches:
                            if not txt.startswith("professor."): # Ignoruj kľúče
                                print(f"   - '{txt}'")

if __name__ == "__main__":
    check_locales()
    check_hardcoded_strings()