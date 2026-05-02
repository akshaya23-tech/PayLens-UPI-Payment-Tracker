"""
PayLens — UPI Expense Tracker
Flask + MySQL Backend
Run: python app.py
"""

from flask import Flask, jsonify, request, render_template, abort
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ─── Database config (reads from .env) ──────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "user":     os.getenv("DB_USER",     "root"),
    "password": os.getenv("DB_PASSWORD", "aksh_23"),
    "database": os.getenv("DB_NAME",     "paylens"),
    "charset":  "utf8mb4",
    "autocommit": False,
}

def get_db():
    """Return a fresh MySQL connection."""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"[DB ERROR] {e}")
        return None

def query(sql, params=None, fetch="all", commit=False):
    """
    Run a SQL statement.
    fetch = "all" | "one" | "none"
    Returns (data, error_string)
    """
    conn = get_db()
    if conn is None:
        return None, "Cannot connect to database"
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params or ())
        if commit:
            conn.commit()
            return {"affected": cur.rowcount, "lastrowid": cur.lastrowid}, None
        if fetch == "all":
            return cur.fetchall(), None
        if fetch == "one":
            return cur.fetchone(), None
        return None, None
    except Error as e:
        conn.rollback()
        return None, str(e)
    finally:
        cur.close()
        conn.close()


# ══════════════════════════════════════════════════════════════
#  PAGES  (serve HTML)
# ══════════════════════════════════════════════════════════════

@app.route("/")
def dashboard():
    return render_template("index.html")

@app.route("/transactions")
def transactions_page():
    return render_template("transactions.html")

@app.route("/analytics")
def analytics_page():
    return render_template("analytics.html")

@app.route("/merchants")
def merchants_page():
    return render_template("merchants.html")

@app.route("/budgets")
def budgets_page():
    return render_template("budgets.html")


# ══════════════════════════════════════════════════════════════
#  API — TRANSACTIONS
# ══════════════════════════════════════════════════════════════

@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    """
    GET /api/transactions
    Query params: month, category, upi_app, search, high_value, sort, page, per_page
    """
    month      = request.args.get("month")         # e.g. "2024-03"
    category   = request.args.get("category")
    upi_app    = request.args.get("upi_app")
    search     = request.args.get("search")
    high_value = request.args.get("high_value")    # "1" = filter >10000
    sort       = request.args.get("sort", "date_desc")
    page       = int(request.args.get("page", 1))
    per_page   = int(request.args.get("per_page", 15))

    conditions = ["t.user_id = %s"]
    params     = [1]   # single-user demo

    if month:
        conditions.append("DATE_FORMAT(t.txn_date, '%%Y-%%m') = %s")
        params.append(month)
    if category:
        conditions.append("c.name = %s")
        params.append(category)
    if upi_app:
        conditions.append("a.app_name = %s")
        params.append(upi_app)
    if search:
        conditions.append("(t.merchant_name LIKE %s OR t.note LIKE %s)")
        params += [f"%{search}%", f"%{search}%"]
    if high_value == "1":
        conditions.append("t.amount > 10000")

    where = " AND ".join(conditions)

    sort_map = {
        "date_desc": "t.txn_date DESC, t.txn_id DESC",
        "date_asc":  "t.txn_date ASC,  t.txn_id ASC",
        "amt_desc":  "t.amount DESC",
        "amt_asc":   "t.amount ASC",
    }
    order = sort_map.get(sort, "t.txn_date DESC, t.txn_id DESC")

    # Count total for pagination
    count_sql = f"""
        SELECT COUNT(*) AS total
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.category_id
        LEFT JOIN upi_apps   a ON t.app_id       = a.app_id
        WHERE {where}
    """
    count_row, err = query(count_sql, params, fetch="one")
    if err:
        return jsonify({"error": err}), 500
    total = count_row["total"] if count_row else 0

    # Fetch page
    offset = (page - 1) * per_page
    sql = f"""
        SELECT
            t.txn_id, t.merchant_name, t.amount, t.txn_date,
            t.txn_type, t.upi_ref, t.note,
            c.name  AS category,
            a.app_name AS upi_app
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.category_id
        LEFT JOIN upi_apps   a ON t.app_id       = a.app_id
        WHERE {where}
        ORDER BY {order}
        LIMIT %s OFFSET %s
    """
    rows, err = query(sql, params + [per_page, offset])
    if err:
        return jsonify({"error": err}), 500

    # Serialise dates
    for r in rows:
        if isinstance(r.get("txn_date"), datetime):
            r["txn_date"] = r["txn_date"].strftime("%Y-%m-%d")
        r["amount"] = float(r["amount"])

    return jsonify({
        "data":       rows,
        "total":      total,
        "page":       page,
        "per_page":   per_page,
        "total_pages": (total + per_page - 1) // per_page,
    })


@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    """POST /api/transactions — add one transaction."""
    body = request.json or {}
    required = ["merchant_name", "amount", "txn_date", "category", "upi_app"]
    for f in required:
        if not body.get(f):
            return jsonify({"error": f"Missing field: {f}"}), 400

    # Resolve category_id
    cat_row, _ = query(
        "SELECT category_id FROM categories WHERE name = %s",
        (body["category"],), fetch="one"
    )
    if not cat_row:
        return jsonify({"error": f"Unknown category: {body['category']}"}), 400

    # Resolve app_id
    app_row, _ = query(
        "SELECT app_id FROM upi_apps WHERE app_name = %s",
        (body["upi_app"],), fetch="one"
    )
    if not app_row:
        return jsonify({"error": f"Unknown UPI app: {body['upi_app']}"}), 400

    result, err = query(
        """
        INSERT INTO transactions
            (user_id, merchant_name, amount, txn_type, category_id, app_id, txn_date, note)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            1,
            body["merchant_name"],
            float(body["amount"]),
            body.get("txn_type", "debit"),
            cat_row["category_id"],
            app_row["app_id"],
            body["txn_date"],
            body.get("note", ""),
        ),
        fetch="none", commit=True
    )
    if err:
        return jsonify({"error": err}), 500
    return jsonify({"success": True, "txn_id": result["lastrowid"]}), 201


@app.route("/api/transactions/<int:txn_id>", methods=["PUT"])
def update_transaction(txn_id):
    """PUT /api/transactions/<id> — update a transaction."""
    body = request.json or {}

    cat_row, _ = query(
        "SELECT category_id FROM categories WHERE name = %s",
        (body.get("category"),), fetch="one"
    )
    app_row, _ = query(
        "SELECT app_id FROM upi_apps WHERE app_name = %s",
        (body.get("upi_app"),), fetch="one"
    )

    result, err = query(
        """
        UPDATE transactions
        SET merchant_name = %s,
            amount        = %s,
            txn_date      = %s,
            category_id   = %s,
            app_id        = %s,
            note          = %s
        WHERE txn_id = %s AND user_id = 1
        """,
        (
            body.get("merchant_name"),
            float(body.get("amount", 0)),
            body.get("txn_date"),
            cat_row["category_id"] if cat_row else None,
            app_row["app_id"]      if app_row else None,
            body.get("note", ""),
            txn_id,
        ),
        fetch="none", commit=True
    )
    if err:
        return jsonify({"error": err}), 500
    return jsonify({"success": True})


@app.route("/api/transactions/<int:txn_id>", methods=["DELETE"])
def delete_transaction(txn_id):
    """DELETE /api/transactions/<id>"""
    result, err = query(
        "DELETE FROM transactions WHERE txn_id = %s AND user_id = 1",
        (txn_id,), fetch="none", commit=True
    )
    if err:
        return jsonify({"error": err}), 500
    return jsonify({"success": True})


@app.route("/api/transactions/bulk", methods=["POST"])
def bulk_import():
    """
    POST /api/transactions/bulk
    Body: { "transactions": [ {merchant_name, amount, txn_date, category, upi_app, note}, ... ] }
    """
    body = request.json or {}
    rows = body.get("transactions", [])
    if not rows:
        return jsonify({"error": "No transactions provided"}), 400

    # Cache lookups
    cats = {}
    apps = {}
    cat_rows, _ = query("SELECT category_id, name FROM categories")
    app_rows, _ = query("SELECT app_id, app_name FROM upi_apps")
    for r in (cat_rows or []):
        cats[r["name"]] = r["category_id"]
    for r in (app_rows or []):
        apps[r["app_name"]] = r["app_id"]

    inserted = 0
    errors   = []
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB connection failed"}), 500

    try:
        cur = conn.cursor()
        for i, t in enumerate(rows):
            cat_id = cats.get(t.get("category", "Other"), cats.get("Other"))
            app_id = apps.get(t.get("upi_app", "Other"), apps.get("Other"))
            if not cat_id or not app_id:
                errors.append(f"Row {i}: unknown category or app")
                continue
            try:
                cur.execute(
                    """
                    INSERT INTO transactions
                        (user_id, merchant_name, amount, txn_type, category_id, app_id, txn_date, note)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (1, t["merchant_name"], float(t["amount"]), "debit",
                     cat_id, app_id, t["txn_date"], t.get("note", ""))
                )
                inserted += 1
            except Error as e:
                errors.append(f"Row {i}: {e}")
        conn.commit()
    except Error as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()

    return jsonify({"success": True, "inserted": inserted, "errors": errors}), 201


# ══════════════════════════════════════════════════════════════
#  API — DASHBOARD
# ══════════════════════════════════════════════════════════════

@app.route("/api/dashboard/summary", methods=["GET"])
def dashboard_summary():
    """GET /api/dashboard/summary?month=2024-03"""
    month = request.args.get("month")

    where = "user_id = 1"
    params = []
    if month and month != "all":
        where += " AND DATE_FORMAT(txn_date, '%%Y-%%m') = %s"
        params.append(month)

    # Overall stats
    stats, err = query(f"""
        SELECT
            COALESCE(SUM(amount), 0)            AS total_spent,
            COUNT(*)                             AS txn_count,
            COALESCE(AVG(amount), 0)             AS avg_amount,
            SUM(amount > 10000)                  AS high_value_count,
            COALESCE(SUM(CASE WHEN amount > 10000 THEN amount ELSE 0 END), 0)
                                                 AS high_value_total
        FROM transactions
        WHERE {where} AND txn_type = 'debit'
    """, params, fetch="one")
    if err:
        return jsonify({"error": err}), 500

    # Category breakdown
    cat_sql = f"""
        SELECT c.name AS category, SUM(t.amount) AS total
        FROM transactions t
        JOIN categories c ON t.category_id = c.category_id
        WHERE t.{where.replace('user_id', 't.user_id')} AND t.txn_type = 'debit'
        GROUP BY c.name
        ORDER BY total DESC
    """
    # rebuild where for JOIN query
    cond2 = "t.user_id = 1"
    p2 = []
    if month and month != "all":
        cond2 += " AND DATE_FORMAT(t.txn_date, '%%Y-%%m') = %s"
        p2.append(month)

    cats, _ = query(f"""
        SELECT c.name AS category, SUM(t.amount) AS total
        FROM transactions t
        JOIN categories c ON t.category_id = c.category_id
        WHERE {cond2} AND t.txn_type = 'debit'
        GROUP BY c.name ORDER BY total DESC
    """, p2)

    # UPI app breakdown
    upis, _ = query(f"""
        SELECT a.app_name, SUM(t.amount) AS total, COUNT(*) AS count
        FROM transactions t
        JOIN upi_apps a ON t.app_id = a.app_id
        WHERE {cond2} AND t.txn_type = 'debit'
        GROUP BY a.app_name ORDER BY total DESC
    """, p2)

    # Monthly trend (always last 4 months)
    trend, _ = query("""
        SELECT DATE_FORMAT(txn_date,'%Y-%m') AS month,
               SUM(amount) AS total
        FROM transactions
        WHERE user_id = 1 AND txn_type = 'debit'
          AND txn_date >= DATE_SUB(CURDATE(), INTERVAL 4 MONTH)
        GROUP BY month ORDER BY month ASC
    """)

    # Recent transactions
    recent, _ = query(f"""
        SELECT t.txn_id, t.merchant_name, t.amount, t.txn_date,
               c.name AS category, a.app_name AS upi_app, t.note
        FROM transactions t
        JOIN categories c ON t.category_id = c.category_id
        JOIN upi_apps   a ON t.app_id       = a.app_id
        WHERE {cond2} AND t.txn_type = 'debit'
        ORDER BY t.txn_date DESC, t.txn_id DESC LIMIT 8
    """, p2)

    # High value
    hv, _ = query(f"""
        SELECT t.txn_id, t.merchant_name, t.amount, t.txn_date,
               c.name AS category, a.app_name AS upi_app
        FROM transactions t
        JOIN categories c ON t.category_id = c.category_id
        JOIN upi_apps   a ON t.app_id       = a.app_id
        WHERE {cond2} AND t.txn_type = 'debit' AND t.amount > 10000
        ORDER BY t.amount DESC LIMIT 10
    """, p2)

    def ser(rows):
        if not rows:
            return []
        out = []
        for r in rows:
            d = dict(r)
            for k, v in d.items():
                if hasattr(v, "strftime"):
                    d[k] = v.strftime("%Y-%m-%d")
                elif hasattr(v, "__float__"):
                    d[k] = float(v)
            out.append(d)
        return out

    def ser1(r):
        if not r:
            return {}
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, "__float__"):
                d[k] = float(v)
        return d

    return jsonify({
        "stats":      ser1(stats),
        "categories": ser(cats),
        "upi_apps":   ser(upis),
        "trend":      ser(trend),
        "recent":     ser(recent),
        "high_value": ser(hv),
    })


# ══════════════════════════════════════════════════════════════
#  API — ANALYTICS
# ══════════════════════════════════════════════════════════════

@app.route("/api/analytics", methods=["GET"])
def analytics():
    month = request.args.get("month")
    cond  = "t.user_id = 1"
    p     = []
    if month and month != "all":
        cond += " AND DATE_FORMAT(t.txn_date,'%%Y-%%m') = %s"
        p.append(month)

    # Category × month stacked bar (last 4 months)
    cat_month, _ = query("""
        SELECT DATE_FORMAT(t.txn_date,'%Y-%m') AS month,
               c.name AS category,
               SUM(t.amount) AS total
        FROM transactions t
        JOIN categories c ON t.category_id = c.category_id
        WHERE t.user_id = 1 AND t.txn_type = 'debit'
          AND t.txn_date >= DATE_SUB(CURDATE(), INTERVAL 4 MONTH)
        GROUP BY month, c.name
        ORDER BY month, total DESC
    """)

    # Daily spend
    daily, _ = query(f"""
        SELECT t.txn_date, SUM(t.amount) AS total
        FROM transactions t
        WHERE {cond} AND t.txn_type = 'debit'
        GROUP BY t.txn_date ORDER BY t.txn_date ASC
    """, p)

    # Transaction size buckets
    dist, _ = query(f"""
        SELECT
            SUM(amount < 500)                         AS under_500,
            SUM(amount BETWEEN 500   AND 1999)        AS s500_2k,
            SUM(amount BETWEEN 2000  AND 4999)        AS s2k_5k,
            SUM(amount BETWEEN 5000  AND 9999)        AS s5k_10k,
            SUM(amount BETWEEN 10000 AND 24999)       AS s10k_25k,
            SUM(amount >= 25000)                      AS over_25k
        FROM transactions t
        WHERE {cond} AND t.txn_type = 'debit'
    """, p, fetch="one")

    # UPI app pie
    upi_pie, _ = query(f"""
        SELECT a.app_name, SUM(t.amount) AS total
        FROM transactions t
        JOIN upi_apps a ON t.app_id = a.app_id
        WHERE {cond} AND t.txn_type = 'debit'
        GROUP BY a.app_name ORDER BY total DESC
    """, p)

    # Weekday spend
    weekday, _ = query(f"""
        SELECT DAYOFWEEK(t.txn_date) AS dow,
               SUM(t.amount) AS total
        FROM transactions t
        WHERE {cond} AND t.txn_type = 'debit'
        GROUP BY dow ORDER BY dow
    """, p)

    def ser(rows):
        if not rows: return []
        out = []
        for r in rows:
            d = dict(r)
            for k, v in d.items():
                if hasattr(v, "strftime"): d[k] = v.strftime("%Y-%m-%d")
                elif hasattr(v, "__float__"): d[k] = float(v)
                elif v is None: d[k] = 0
            out.append(d)
        return out

    def ser1(r):
        if not r: return {}
        return {k: float(v) if v is not None and hasattr(v,"__float__") else (0 if v is None else v)
                for k,v in r.items()}

    return jsonify({
        "cat_month": ser(cat_month),
        "daily":     ser(daily),
        "dist":      ser1(dist),
        "upi_pie":   ser(upi_pie),
        "weekday":   ser(weekday),
    })


# ══════════════════════════════════════════════════════════════
#  API — MERCHANTS
# ══════════════════════════════════════════════════════════════

@app.route("/api/merchants", methods=["GET"])
def get_merchants():
    month  = request.args.get("month")
    search = request.args.get("search", "")
    cat    = request.args.get("category")

    cond = "t.user_id = 1 AND t.txn_type = 'debit'"
    p    = []
    if month and month != "all":
        cond += " AND DATE_FORMAT(t.txn_date,'%%Y-%%m') = %s"
        p.append(month)
    if search:
        cond += " AND t.merchant_name LIKE %s"
        p.append(f"%{search}%")
    if cat:
        cond += " AND c.name = %s"
        p.append(cat)

    rows, err = query(f"""
        SELECT t.merchant_name,
               SUM(t.amount)    AS total,
               COUNT(*)         AS txn_count,
               MAX(t.txn_date)  AS last_date,
               c.name           AS category
        FROM transactions t
        JOIN categories c ON t.category_id = c.category_id
        WHERE {cond}
        GROUP BY t.merchant_name, c.name
        ORDER BY total DESC
    """, p)
    if err:
        return jsonify({"error": err}), 500

    out = []
    for r in (rows or []):
        out.append({
            "merchant_name": r["merchant_name"],
            "total":         float(r["total"]),
            "txn_count":     r["txn_count"],
            "last_date":     r["last_date"].strftime("%Y-%m-%d") if r["last_date"] else "",
            "category":      r["category"],
        })
    return jsonify(out)


# ══════════════════════════════════════════════════════════════
#  API — BUDGETS
# ══════════════════════════════════════════════════════════════

@app.route("/api/budgets", methods=["GET"])
def get_budgets():
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    rows, err = query(
        "SELECT * FROM budgets WHERE user_id = 1 AND month = %s",
        (month,)
    )
    if err:
        return jsonify({"error": err}), 500

    # Attach actual spending
    out = []
    for b in (rows or []):
        spent_row, _ = query("""
            SELECT COALESCE(SUM(t.amount),0) AS spent
            FROM transactions t
            JOIN categories c ON t.category_id = c.category_id
            WHERE t.user_id = 1
              AND t.txn_type = 'debit'
              AND DATE_FORMAT(t.txn_date,'%%Y-%%m') = %s
              AND c.name = %s
        """, (b["month"], b["category"]), fetch="one")
        out.append({
            "budget_id": b["budget_id"],
            "category":  b["category"],
            "month":     b["month"],
            "limit_amount": float(b["limit_amount"]),
            "spent":     float(spent_row["spent"]) if spent_row else 0,
        })
    return jsonify(out)


@app.route("/api/budgets", methods=["POST"])
def add_budget():
    body = request.json or {}
    result, err = query(
        """
        INSERT INTO budgets (user_id, category, month, limit_amount)
        VALUES (1, %s, %s, %s)
        ON DUPLICATE KEY UPDATE limit_amount = VALUES(limit_amount)
        """,
        (body.get("category"), body.get("month"), float(body.get("limit_amount", 0))),
        fetch="none", commit=True
    )
    if err:
        return jsonify({"error": err}), 500
    return jsonify({"success": True}), 201


@app.route("/api/budgets/<int:budget_id>", methods=["DELETE"])
def delete_budget(budget_id):
    _, err = query(
        "DELETE FROM budgets WHERE budget_id = %s AND user_id = 1",
        (budget_id,), fetch="none", commit=True
    )
    if err:
        return jsonify({"error": err}), 500
    return jsonify({"success": True})


# ══════════════════════════════════════════════════════════════
#  API — META (categories, upi apps, months)
# ══════════════════════════════════════════════════════════════

@app.route("/api/meta", methods=["GET"])
def meta():
    cats, _  = query("SELECT name FROM categories ORDER BY name")
    apps, _  = query("SELECT app_name FROM upi_apps ORDER BY app_name")
    months, _ = query("""
        SELECT DISTINCT DATE_FORMAT(txn_date,'%Y-%m') AS month
        FROM transactions WHERE user_id = 1
        ORDER BY month DESC LIMIT 12
    """)
    return jsonify({
        "categories": [r["name"] for r in (cats or [])],
        "upi_apps":   [r["app_name"] for r in (apps or [])],
        "months":     [r["month"] for r in (months or [])],
    })


# ══════════════════════════════════════════════════════════════
#  HEALTH CHECK
# ══════════════════════════════════════════════════════════════

@app.route("/api/health")
def health():
    conn = get_db()
    if conn:
        conn.close()
        return jsonify({"status": "ok", "db": "connected"})
    return jsonify({"status": "error", "db": "disconnected"}), 500


if __name__ == "__main__":
    print("╔══════════════════════════════════╗")
    print("║   PayLens Flask Server           ║")
    print("║   http://localhost:5000          ║")
    print("╚══════════════════════════════════╝")
    app.run(debug=True, host="0.0.0.0", port=5000)
