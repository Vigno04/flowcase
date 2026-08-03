import sqlite3
import os
import sys

db_path = os.path.join('data', 'flowcase.db')

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}.")
    print("If you are starting fresh, just running the application will automatically create the tables with the latest schema.")
    sys.exit(0)

print(f"Updating database at {db_path}...")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE sso_config ADD COLUMN disable_classic_login BOOLEAN NOT NULL DEFAULT 0")
    print("✅ Added 'disable_classic_login' column to 'sso_config' table.")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e).lower():
        print("ℹ️ Column 'disable_classic_login' already exists in 'sso_config' table.")
    else:
        print(f"❌ Error updating sso_config: {e}")

try:
    cur.execute("ALTER TABLE user ADD COLUMN sso_subject VARCHAR(255)")
    print("✅ Added 'sso_subject' column to 'user' table.")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e).lower():
        print("ℹ️ Column 'sso_subject' already exists in 'user' table.")
    else:
        print(f"❌ Error updating user: {e}")

conn.commit()
conn.close()
print("Database update complete! You can now restart Flowcase to test.")
