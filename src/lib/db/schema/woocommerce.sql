-- WooCommerce Orders Table
CREATE TABLE IF NOT EXISTS woocommerce_orders (
  id INTEGER PRIMARY KEY,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL,
  total REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  date_created TEXT NOT NULL,
  date_modified TEXT NOT NULL,
  date_paid TEXT,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_city TEXT,
  customer_country TEXT,
  shipping_name TEXT,
  shipping_city TEXT,
  shipping_country TEXT,
  payment_method TEXT,
  payment_method_title TEXT,
  transaction_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- WooCommerce Clients Table (aggregated data)
CREATE TABLE IF NOT EXISTS woocommerce_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  city TEXT,
  country TEXT,
  total_orders INTEGER DEFAULT 0,
  processing_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  total_spent REAL DEFAULT 0,
  processing_amount REAL DEFAULT 0,
  completed_amount REAL DEFAULT 0,
  first_order_date TEXT,
  last_order_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- WooCommerce Summary Table (for caching)
CREATE TABLE IF NOT EXISTS woocommerce_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_clients INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  processing_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  processing_revenue REAL DEFAULT 0,
  completed_revenue REAL DEFAULT 0,
  average_order_value REAL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  last_sync DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_woocommerce_orders_email ON woocommerce_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_woocommerce_orders_status ON woocommerce_orders(status);
CREATE INDEX IF NOT EXISTS idx_woocommerce_orders_date ON woocommerce_orders(date_created);
CREATE INDEX IF NOT EXISTS idx_woocommerce_clients_email ON woocommerce_clients(email);
CREATE INDEX IF NOT EXISTS idx_woocommerce_clients_total_spent ON woocommerce_clients(total_spent);

-- Triggers to update timestamps
CREATE TRIGGER IF NOT EXISTS update_woocommerce_orders_timestamp 
  AFTER UPDATE ON woocommerce_orders
  BEGIN
    UPDATE woocommerce_orders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_woocommerce_clients_timestamp 
  AFTER UPDATE ON woocommerce_clients
  BEGIN
    UPDATE woocommerce_clients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_woocommerce_summary_timestamp 
  AFTER UPDATE ON woocommerce_summary
  BEGIN
    UPDATE woocommerce_summary SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
