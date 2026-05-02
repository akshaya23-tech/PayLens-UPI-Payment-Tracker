-- ============================================================
--  PayLens — Full MySQL Schema
--  Run this FIRST before starting the Flask server
--  mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS paylens
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE paylens;

-- ─── users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id    INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100)        NOT NULL,
    email      VARCHAR(150) UNIQUE NOT NULL,
    phone      VARCHAR(15),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO users (user_id, name, email, phone)
VALUES (1, 'Rahul Sharma', 'rahul@example.com', '9876543210');

-- ─── upi_apps ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upi_apps (
    app_id   INT AUTO_INCREMENT PRIMARY KEY,
    app_name VARCHAR(50) UNIQUE NOT NULL
);

INSERT IGNORE INTO upi_apps (app_name) VALUES
    ('PhonePe'), ('GPay'), ('Paytm'), ('BHIM'), ('Other');

-- ─── categories ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,
    color_hex   VARCHAR(7)  DEFAULT '#888888',
    emoji       VARCHAR(10) DEFAULT '📦'
);

INSERT IGNORE INTO categories (name, color_hex, emoji) VALUES
    ('Transport',     '#1D9E75', '🚌'),
    ('Food',          '#EF9F27', '🍔'),
    ('Shopping',      '#378ADD', '🛍️'),
    ('Utilities',     '#7F77DD', '⚡'),
    ('Entertainment', '#D85A30', '🎬'),
    ('Health',        '#D4537E', '💊'),
    ('Education',     '#639922', '📚'),
    ('Rent',          '#888780', '🏠'),
    ('Other',         '#B4B2A9', '📦');

-- ─── merchants ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchants (
    merchant_id    INT AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    default_cat_id INT,
    upi_id         VARCHAR(100),
    FOREIGN KEY (default_cat_id) REFERENCES categories(category_id)
);

-- ─── transactions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    txn_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT           NOT NULL,
    merchant_id   INT,
    merchant_name VARCHAR(150)  NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    CONSTRAINT chk_amount CHECK (amount > 0),
    txn_type      ENUM('debit','credit') DEFAULT 'debit',
    category_id   INT,
    app_id        INT,
    txn_date      DATE          NOT NULL,
    txn_time      TIME,
    upi_ref       VARCHAR(50),
    note          VARCHAR(255),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)     REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (app_id)      REFERENCES upi_apps(app_id),
    INDEX idx_user_date   (user_id, txn_date),
    INDEX idx_category    (category_id),
    INDEX idx_amount      (amount),
    INDEX idx_merchant    (merchant_name),
    INDEX idx_app         (app_id)
);

-- ─── monthly_summary ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_summary (
    summary_id  INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT     NOT NULL,
    `year_month` CHAR(7) NOT NULL,
    category_id INT,
    total_spent DECIMAL(12,2) DEFAULT 0,
    txn_count   INT           DEFAULT 0,
    UNIQUE KEY uq_user_month_cat (user_id, `year_month`, category_id),
    FOREIGN KEY (user_id)     REFERENCES users(user_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

-- ─── budgets ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
    budget_id    INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT     NOT NULL,
    category     VARCHAR(50) NOT NULL,
    month        CHAR(7) NOT NULL,
    limit_amount DECIMAL(12,2) NOT NULL,
    UNIQUE KEY uq_budget (user_id, category, month),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- ─── TRIGGER: auto-update monthly_summary ───────────────────
DROP TRIGGER IF EXISTS trg_update_summary;

DELIMITER $$
CREATE TRIGGER trg_update_summary
AFTER INSERT ON transactions
FOR EACH ROW
BEGIN
    IF NEW.txn_type = 'debit' THEN
        INSERT INTO monthly_summary
            (user_id, `year_month`, category_id, total_spent, txn_count)
        VALUES
            (NEW.user_id, DATE_FORMAT(NEW.txn_date,'%Y-%m'),
             NEW.category_id, NEW.amount, 1)
        ON DUPLICATE KEY UPDATE
            total_spent = total_spent + NEW.amount,
            txn_count   = txn_count + 1;
    END IF;
END$$
DELIMITER ;

-- ─── VIEWS ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_monthly_total AS
SELECT user_id,
       DATE_FORMAT(txn_date,'%Y-%m') AS `year_month`,
       SUM(amount)  AS total_spent,
       COUNT(*)     AS txn_count
FROM transactions WHERE txn_type='debit'
GROUP BY user_id, DATE_FORMAT(txn_date,'%Y-%m');

CREATE OR REPLACE VIEW v_category_monthly AS
SELECT t.user_id,
       DATE_FORMAT(t.txn_date,'%Y-%m') AS `year_month`,
       c.name AS category,
       SUM(t.amount) AS total_spent,
       COUNT(*) AS txn_count
FROM transactions t
JOIN categories c ON t.category_id = c.category_id
WHERE t.txn_type='debit'
GROUP BY t.user_id, DATE_FORMAT(t.txn_date,'%Y-%m'), c.name;

CREATE OR REPLACE VIEW v_high_value AS
SELECT t.txn_id, t.user_id, t.merchant_name,
       c.name AS category, a.app_name, t.amount, t.txn_date, t.note
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.category_id
LEFT JOIN upi_apps   a ON t.app_id       = a.app_id
WHERE t.amount > 10000 AND t.txn_type='debit'
ORDER BY t.amount DESC;

CREATE OR REPLACE VIEW v_merchant_summary AS
SELECT user_id, merchant_name,
       SUM(amount)   AS total_spent,
       COUNT(*)      AS txn_count,
       MAX(txn_date) AS last_txn_date
FROM transactions WHERE txn_type='debit'
GROUP BY user_id, merchant_name
ORDER BY total_spent DESC;

CREATE OR REPLACE VIEW v_upi_app_usage AS
SELECT t.user_id, a.app_name,
       DATE_FORMAT(t.txn_date,'%Y-%m') AS `year_month`,
       SUM(t.amount) AS total_spent,
       COUNT(*) AS txn_count
FROM transactions t
JOIN upi_apps a ON t.app_id = a.app_id
WHERE t.txn_type='debit'
GROUP BY t.user_id, a.app_name, DATE_FORMAT(t.txn_date,'%Y-%m');

-- ─── STORED PROCEDURES ───────────────────────────────────────
DROP PROCEDURE IF EXISTS sp_monthly_report;
DROP PROCEDURE IF EXISTS sp_search_transactions;

DELIMITER $$

CREATE PROCEDURE sp_monthly_report(IN p_user_id INT, IN p_month CHAR(7))
BEGIN
    SELECT SUM(amount) AS total_spent, COUNT(*) AS txn_count,
           SUM(amount > 10000) AS high_value_count, AVG(amount) AS avg_transaction
    FROM transactions
    WHERE user_id=p_user_id AND DATE_FORMAT(txn_date,'%Y-%m')=p_month AND txn_type='debit';

    SELECT c.name AS category, SUM(t.amount) AS spent, COUNT(*) AS txn_count
    FROM transactions t JOIN categories c ON t.category_id=c.category_id
    WHERE t.user_id=p_user_id AND DATE_FORMAT(t.txn_date,'%Y-%m')=p_month AND t.txn_type='debit'
    GROUP BY c.name ORDER BY spent DESC;
END$$

CREATE PROCEDURE sp_search_transactions(
    IN p_user_id INT, IN p_keyword VARCHAR(100),
    IN p_month CHAR(7), IN p_min_amt DECIMAL(12,2), IN p_max_amt DECIMAL(12,2)
)
BEGIN
    SELECT t.txn_id, t.merchant_name, c.name AS category,
           a.app_name, t.amount, t.txn_date, t.note
    FROM transactions t
    LEFT JOIN categories c ON t.category_id=c.category_id
    LEFT JOIN upi_apps   a ON t.app_id=a.app_id
    WHERE t.user_id=p_user_id AND t.txn_type='debit'
      AND (p_keyword IS NULL OR t.merchant_name LIKE CONCAT('%',p_keyword,'%') OR t.note LIKE CONCAT('%',p_keyword,'%'))
      AND (p_month   IS NULL OR DATE_FORMAT(t.txn_date,'%Y-%m')=p_month)
      AND (p_min_amt IS NULL OR t.amount >= p_min_amt)
      AND (p_max_amt IS NULL OR t.amount <= p_max_amt)
    ORDER BY t.txn_date DESC;
END$$

DELIMITER ;

-- ─── SAMPLE DATA (54 transactions) ───────────────────────────
INSERT IGNORE INTO transactions
    (user_id, merchant_name, amount, txn_type, category_id, app_id, txn_date, note)
VALUES
-- March 2024
(1,'BMTC',420,'debit',1,1,'2024-03-01','Bus pass recharge'),
(1,'House Rent',18000,'debit',8,2,'2024-03-01','Monthly rent - Indiranagar'),
(1,'Swiggy',385,'debit',2,2,'2024-03-03',''),
(1,'Amazon',15200,'debit',3,1,'2024-03-05','Sony WH-1000XM5 headphones'),
(1,'BESCOM',1850,'debit',4,3,'2024-03-06','Electricity bill March'),
(1,'Zomato',620,'debit',2,2,'2024-03-08','Dinner with team'),
(1,'Namma Metro',680,'debit',1,1,'2024-03-10','Metro card top-up'),
(1,'Myntra',2200,'debit',3,2,'2024-03-11','Summer clothes'),
(1,'Netflix',649,'debit',5,1,'2024-03-12','Monthly subscription'),
(1,'Apollo Pharmacy',1100,'debit',6,2,'2024-03-14','Medicines'),
(1,'BMTC',420,'debit',1,1,'2024-03-15',''),
(1,'Flipkart',12500,'debit',3,1,'2024-03-16','Xiaomi 13C mobile'),
(1,'Dominos',560,'debit',2,3,'2024-03-18',''),
(1,'Byju\'s',4500,'debit',7,1,'2024-03-20','Monthly subscription'),
(1,'Rapido',180,'debit',1,2,'2024-03-21',''),
(1,'BigBasket',1240,'debit',2,1,'2024-03-22','Weekly groceries'),
(1,'Ola',320,'debit',1,3,'2024-03-23',''),
(1,'Jio Recharge',299,'debit',4,1,'2024-03-24','84-day plan'),
(1,'PVR Cinemas',780,'debit',5,2,'2024-03-25','Dune 2 tickets'),
(1,'Decathlon',3800,'debit',3,2,'2024-03-26','Running shoes'),
(1,'Swiggy Instamart',640,'debit',2,2,'2024-03-27',''),
(1,'BMTC',420,'debit',1,1,'2024-03-29',''),
-- February 2024
(1,'House Rent',18000,'debit',8,2,'2024-02-01','Monthly rent'),
(1,'BMTC',420,'debit',1,1,'2024-02-02',''),
(1,'Swiggy',450,'debit',2,2,'2024-02-05',''),
(1,'BESCOM',1720,'debit',4,3,'2024-02-07','Electricity bill'),
(1,'Amazon',3200,'debit',3,2,'2024-02-09','Desk lamp'),
(1,'Namma Metro',500,'debit',1,1,'2024-02-10',''),
(1,'Zomato',520,'debit',2,2,'2024-02-12','Valentine dinner'),
(1,'Spotify',119,'debit',5,1,'2024-02-13',''),
(1,'Cult.fit',2200,'debit',6,2,'2024-02-14','Monthly gym'),
(1,'BigBasket',1100,'debit',2,1,'2024-02-16',''),
(1,'Jio Recharge',299,'debit',4,1,'2024-02-17',''),
(1,'Rapido',240,'debit',1,2,'2024-02-20',''),
(1,'Byju\'s',4500,'debit',7,1,'2024-02-22',''),
(1,'Dominos',480,'debit',2,3,'2024-02-25',''),
(1,'Flipkart',1299,'debit',3,1,'2024-02-27','Phone case'),
-- January 2024
(1,'House Rent',18000,'debit',8,2,'2024-01-01','Monthly rent'),
(1,'BMTC',420,'debit',1,1,'2024-01-03',''),
(1,'Swiggy',380,'debit',2,2,'2024-01-06',''),
(1,'BESCOM',1680,'debit',4,3,'2024-01-08','Electricity'),
(1,'Amazon',22500,'debit',3,1,'2024-01-10','iPad Air'),
(1,'Namma Metro',600,'debit',1,1,'2024-01-12',''),
(1,'Cult.fit',2200,'debit',6,2,'2024-01-14','Monthly gym'),
(1,'Zomato',340,'debit',2,2,'2024-01-16',''),
(1,'Jio Recharge',299,'debit',4,1,'2024-01-18',''),
(1,'Byju\'s',4500,'debit',7,1,'2024-01-20',''),
(1,'PVR Cinemas',650,'debit',5,2,'2024-01-22',''),
(1,'BigBasket',980,'debit',2,1,'2024-01-24',''),
(1,'Rapido',150,'debit',1,2,'2024-01-26',''),
-- April 2024
(1,'House Rent',18000,'debit',8,2,'2024-04-01','Monthly rent'),
(1,'BMTC',420,'debit',1,1,'2024-04-02',''),
(1,'Swiggy',490,'debit',2,2,'2024-04-04',''),
(1,'BESCOM',2100,'debit',4,3,'2024-04-06','Summer electricity bill');

-- Default budgets for March 2024
INSERT IGNORE INTO budgets (user_id, category, month, limit_amount) VALUES
(1,'Food',      '2024-03', 5000),
(1,'Transport', '2024-03', 3000),
(1,'Shopping',  '2024-03',10000),
(1,'Rent',      '2024-03',20000);

SELECT 'PayLens schema ready!' AS status;
