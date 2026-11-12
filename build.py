#!/usr/bin/env python3
"""Builds the web client into public/: the pages as they are, plus one
dictionary per language. No bundler: the browser loads the modules itself.

    python3 build.py           # check the dictionaries and build public/
    python3 build.py --check   # only check: what is missing or unused, per language
    python3 build.py --keys    # every text the client passes to tr()/trn(), with where

Keys are the Russian texts, as in the desktop apps. ru.json holds only the
plural forms (trn), since for everything else the key is the text itself.
A text missing from a language is filled with the English one; a text
missing from English stops the build.
"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
I18N = os.path.join(ROOT, "i18n")
OUT = os.path.join(ROOT, "public")
LANGS = ["en", "es", "pt", "de", "fr", "it", "pl", "tr", "uk", "ru", "id", "ko", "zh"]
CATEGORIES = {
    "ru": {"one", "few", "many"}, "uk": {"one", "few", "many"}, "pl": {"one", "few", "many"},
    "id": {"other"}, "ko": {"other"}, "zh": {"other"},
}
PLACEHOLDER = re.compile(r"\{(\w+)\}")
CALL = re.compile(r"\b(trn?)\('((?:[^'\\\n]|\\.)*)'")


def version():
    text = open(os.path.join(SRC, "js", "config.js"), encoding="utf-8").read()
    return re.search(r"VERSION = '([^']+)'", text).group(1)


def used():
    keys = {}
    for base, _, files in os.walk(os.path.join(SRC, "js")):
        for name in sorted(files):
            if not name.endswith(".js"):
                continue
            path = os.path.join(base, name)
            for n, line in enumerate(open(path, encoding="utf-8"), 1):
                if line.lstrip().startswith("//"):
                    continue
                for m in CALL.finditer(line):
                    key = m.group(2).replace("\\'", "'").replace("\\n", "\n").replace("\\\\", "\\")
                    entry = keys.setdefault(key, {"plural": False, "where": []})
                    entry["plural"] |= m.group(1) == "trn"
                    entry["where"].append(f"{os.path.relpath(path, ROOT)}:{n}")
    return keys


def load(lang):
    return json.load(open(os.path.join(I18N, f"{lang}.json"), encoding="utf-8"))


def check(keys):
    """What each language lacks or has wrong; returns the number of problems
    that stop the build (English gaps, broken placeholders and plurals)."""
    fatal = 0
    for lang in LANGS:
        table = load(lang)
        wanted = {k for k, e in keys.items() if e["plural"]} if lang == "ru" else set(keys)
        missing = sorted(wanted - set(table))
        unused = sorted(set(table) - wanted)
        for key in missing:
            print(f"{lang}: missing {json.dumps(key, ensure_ascii=False)}  ({keys[key]['where'][0]})")
            if lang == "en":
                fatal += 1
        for key in unused:
            print(f"{lang}: unused {json.dumps(key, ensure_ascii=False)}")
        for key in sorted(wanted & set(table)):
            value = table[key]
            names = set(PLACEHOLDER.findall(key))
            if keys[key]["plural"]:
                if not isinstance(value, dict):
                    print(f"{lang}: {json.dumps(key, ensure_ascii=False)} needs plural forms")
                    fatal += 1
                    continue
                need = CATEGORIES.get(lang, {"one", "other"})
                if set(value) != need:
                    print(f"{lang}: {json.dumps(key, ensure_ascii=False)} has forms {sorted(value)}, wants {sorted(need)}")
                    fatal += 1
                forms = list(value.values())
            else:
                if not isinstance(value, str):
                    print(f"{lang}: {json.dumps(key, ensure_ascii=False)} should be a plain text")
                    fatal += 1
                    continue
                forms = [value]
            for form in forms:
                if set(PLACEHOLDER.findall(form)) != names:
                    print(f"{lang}: placeholders differ in {json.dumps(key, ensure_ascii=False)}: {json.dumps(form, ensure_ascii=False)}")
                    fatal += 1
    return fatal


def build(keys):
    v = version()
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT)
    page = os.path.join(OUT, "index.html")
    text = open(page, encoding="utf-8").read().replace("__VERSION__", v)
    open(page, "w", encoding="utf-8").write(text)

    english = load("en")
    os.makedirs(os.path.join(OUT, "i18n"))
    for lang in LANGS:
        table = load(lang)
        out = {}
        for key, entry in sorted(keys.items()):
            if lang == "ru":
                if entry["plural"]:
                    out[key] = table[key]
            elif key in table:
                out[key] = table[key]
            elif not (entry["plural"] and lang in CATEGORIES):
                out[key] = english[key]
        with open(os.path.join(OUT, "i18n", f"{lang}.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"public/ built: Love Around web {v}, {len(keys)} texts in {len(LANGS)} languages")


def main():
    keys = used()
    if "--keys" in sys.argv:
        for key, entry in sorted(keys.items()):
            print(("[n] " if entry["plural"] else "    ") + json.dumps(key, ensure_ascii=False), entry["where"][0])
        return 0
    fatal = check(keys)
    if fatal:
        print(f"{fatal} problem(s) in the dictionaries")
        return 1
    if "--check" in sys.argv:
        print("dictionaries are complete")
        return 0
    build(keys)
    return 0


if __name__ == "__main__":
    sys.exit(main())
