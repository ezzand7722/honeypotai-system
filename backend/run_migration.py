import os
import psycopg
from dotenv import load_dotenv

def main():
    load_dotenv(dotenv_path="G:/college project/proj/backend/.env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not found in .env")
        return

    print(f"Connecting to {database_url}...")
    try:
        with psycopg.connect(database_url) as conn:
            print("Connected successfully!")
            
            with open("G:/college project/proj/backend/supabase_migration.sql", "r") as f:
                migration_sql = f.read()

            with conn.cursor() as cur:
                cur.execute(migration_sql)
            conn.commit()
            print("Migration executed successfully!")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
