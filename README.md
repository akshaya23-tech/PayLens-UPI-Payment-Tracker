# PayLens — Flask + MySQL Setup Guide

## Project Structure

```
paylens-flask/
├── app.py                  ← Flask backend (all API routes)
├── schema.sql              ← MySQL schema + sample data
├── requirements.txt        ← Python packages
├── .env                    ← Your database credentials
├── templates/
│   ├── base.html           ← Shared layout (sidebar, navbar, modals)
│   ├── index.html          ← Dashboard
│   ├── transactions.html   ← Transactions table
│   ├── analytics.html      ← Charts
│   ├── merchants.html      ← Merchant cards
│   └── budgets.html        ← Budget management
└── static/
    ├── css/style.css       ← Full stylesheet
    └── js/
        ├── api.js          ← All fetch calls to Flask
        ├── dashboard.js
        ├── transactions.js
        ├── analytics.js
        ├── merchants.js
        └── budgets.js
```

---

## Step 1 — Install MySQL

If you don't have MySQL installed:
- Download MySQL Community Server from https://dev.mysql.com/downloads/
- During setup, set a root password — remember it

---

## Step 2 — Create the Database

Open your terminal (Command Prompt / PowerShell on Windows, Terminal on Mac):

```bash
mysql -u root -p
```

Enter your password when prompted. Then run:

```sql
source /full/path/to/paylens-flask/schema.sql
```

Or from outside MySQL:

```bash
mysql -u root -p < schema.sql
```

You should see: `PayLens schema ready!`

---

## Step 3 — Configure .env

Open the `.env` file and fill in your MySQL password:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_actual_password_here
DB_NAME=paylens
```

---

## Step 4 — Install Python Packages

Make sure Python 3.8+ is installed. Then:

```bash
cd paylens-flask
pip install -r requirements.txt
```

This installs Flask, mysql-connector-python, flask-cors, and python-dotenv.

---

## Step 5 — Run the App

```bash
python app.py
```

You will see:
```
╔══════════════════════════════════╗
║   PayLens Flask Server           ║
║   http://localhost:5000          ║
╚══════════════════════════════════╝
```

Open your browser at: **http://localhost:5000**

---

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary?month=2024-03` | Dashboard stats, charts, recent txns |
| GET | `/api/transactions` | List transactions (filterable, paginated) |
| POST | `/api/transactions` | Add one transaction |
| PUT | `/api/transactions/<id>` | Update a transaction |
| DELETE | `/api/transactions/<id>` | Delete a transaction |
| POST | `/api/transactions/bulk` | Bulk import from CSV |
| GET | `/api/analytics?month=2024-03` | All analytics chart data |
| GET | `/api/merchants` | Merchant breakdown |
| GET | `/api/budgets?month=2024-03` | Budgets with actual spend |
| POST | `/api/budgets` | Create/update a budget |
| DELETE | `/api/budgets/<id>` | Delete a budget |
| GET | `/api/meta` | Categories, UPI apps, months list |
| GET | `/api/health` | Check DB connection status |

---

## Troubleshooting

**"Can't connect to MySQL"**
- Make sure MySQL server is running
- Check your password in `.env`
- Try: `mysql -u root -p` to confirm MySQL works

**"Module not found"**
- Run `pip install -r requirements.txt` again
- If on Mac/Linux try `pip3` instead of `pip`

**Port 5000 already in use**
- Change the port in the last line of `app.py`:
  `app.run(debug=True, port=5001)`

**"Table doesn't exist"**
- Make sure you ran `schema.sql` first
- Check you're connected to the `paylens` database
