import sys
import sqlite3

def dump(db_path):
    print(f"\n--- Tables in {db_path} ---")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cur.fetchall()
    for (table,) in tables:
        print(f"Table: {table}")
        cur.execute(f"PRAGMA table_info('{table}')")
        columns = cur.fetchall()
        for col in columns:
            print(f"  {col[1]} ({col[2]})")
    conn.close()

if len(sys.argv) > 1:
    dump(sys.argv[1])
