import os
import sqlite3
from pathlib import Path

candidates = [
    os.environ.get("GEEKS_POS_DB_PATH", "").strip(),
    str(Path(os.environ.get("APPDATA", "")) / "GeeksPOS" / "db.sqlite3"),
    str(Path(os.environ.get("LOCALAPPDATA", "")) / "GeeksPOS" / "db.sqlite3"),
    r"C:\Users\Administrator\AppData\Roaming\GeeksPOS\db.sqlite3",
    r"C:\Program Files\GEEKS POS\db.sqlite3",
]

seen = set()
for p in candidates:
    if not p or p in seen:
        continue
    seen.add(p)
    path = Path(p)
    print("\n==>", path)
    if not path.exists():
        print("   NOT FOUND")
        continue
    try:
        con = sqlite3.connect(path)
        cur = con.cursor()
        cur.execute("select count(*) from auth_user")
        user_count = cur.fetchone()[0]
        print("   auth_user count:", user_count)
        cur.execute("select username, is_active from auth_user order by username")
        rows = cur.fetchall()
        print("   users:", rows[:10])

        # profile jadvali nomini tekshirish
        cur.execute("select name from sqlite_master where type='table' and name like '%userprofile%'")
        t = cur.fetchone()
        if t:
            tbl = t[0]
            cur.execute(f"select count(*) from {tbl}")
            pc = cur.fetchone()[0]
            print(f"   {tbl} count:", pc)
        else:
            print("   userprofile table NOT FOUND")
        con.close()
    except Exception as e:
        print("   ERROR:", e)