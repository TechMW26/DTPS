var API_URL = "https://dtpoonamsagar.com/api/orders";
var SHEETS = { completed: "Completed", failed: "Failed", cancelled: "Cancelled" };
var HEADER = [
  "Order ID", "Status", "Customer Name", "Customer Email", "Customer Phone",
  "City", "Products", "Subtotal", "Discount", "Total",
  "Created At (IST)", "Coupon Code", "Source"
];

// ── Configuration ──
var MAX_RETRIES = 3;
var RETRY_DELAY_MS = 2000; // 2 seconds between retries

function safe(v) {
  return (v !== undefined && v !== null && String(v).trim() !== "") ? String(v) : "--";
}

function cleanPhoneNumber(phone) {
  if (!phone) return "--";
  var cleaned = String(phone).trim();
  // Remove leading +, country codes, and non-digit prefixes
  cleaned = cleaned.replace(/^\+?(?:91|1|44|33|49|39|34|46|31|32|43|41|47|45|30|36|40|48|20|212|216|356|357|358|359|385|387|389|421|420|374|373|380|372|371|370|263|672|850|221|230|248|246|242|254|256|237|251|265|266|382|381|383|220|232|233|234|235|236|238|239|240|241|243|244|245|250|251|252|253|254|255|256|257|258|260|261|262|263|264|265|266|267|268|269|290|290|291|297|298|299|350|351|352|353|354|355|356|357|358|359|370|371|372|373|374|375|376|377|378|380|381|382|383|385|386|387|389|420|421|423|500|501|502|503|504|505|506|507|508|509|590|591|592|593|594|595|596|597|598|599|670|672|673|674|675|676|677|678|679|680|681|682|683|684|685|686|687|688|689|690|691|692|850|852|853|855|856|880|886|900|901|902|903|904|905|906|907|908|909|910|911|912|913|914|915|916|917|918|919|920|921|922|923|924|925|926|927|928|929|930|931|932|933|934|935|936|937|938|939|940|941|942|943|944|945|946|947|948|949|950|951|952|953|954|955|956|957|958|959|960|961|962|963|964|965|966|967|968|970|971|972|973|974|975|976|977|992|993|994|995|996|998)\b/, "");
  return cleaned.trim() || "--";
}

function formatIST(value) {
  var d = new Date(value);
  if (isNaN(d.getTime())) return "--";
  return Utilities.formatDate(d, "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
}

function productsToText(products) {
  if (!products || !products.length) return "--";
  return products.map(function(p) {
    return safe(p.name) + " x " + safe(p.quantity);
  }).join(", ");
}

function orderToRow(order) {
  return [
    safe(order.orderId),
    safe(order.paymentStatus).toLowerCase(),
    safe(order.customerName),
    safe(order.customerEmail),
    cleanPhoneNumber(order.customerPhone),
    safe(order.city),
    productsToText(order.products),
    safe(order.subtotal),
    safe(order.discount),
    safe(order.total),
    formatIST(order.createdAt),
    safe(order.coupon && order.coupon.code),
    "Website"
  ];
}

// ── API fetching with retry logic ──

function fetchOrders() {
  var lastError = null;

  for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      var resp = UrlFetchApp.fetch(API_URL, {
        method: "get",
        muteHttpExceptions: true,
        followRedirects: true,
        headers: {
          "Accept": "application/json",
          "User-Agent": "Google-Apps-Script Orders Sync/1.1",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        }
      });

      var code = resp.getResponseCode();
      var body = resp.getContentText();

      if (code === 429) {
        // Rate limited — wait longer before retrying
        Logger.log("⚠️  Rate limited (429). Attempt " + attempt + "/" + MAX_RETRIES + ". Waiting " + (RETRY_DELAY_MS * 2) + "ms...");
        Utilities.sleep(RETRY_DELAY_MS * 2);
        lastError = new Error("Rate limited (HTTP 429)");
        continue;
      }

      if (code !== 200) {
        var preview = body.length > 500 ? body.substring(0, 500) + "..." : body;
        Logger.log("❌ API error HTTP " + code + " | attempt " + attempt + "/" + MAX_RETRIES + " | " + preview);
        lastError = new Error("API error HTTP " + code + " | " + preview);
        if (attempt < MAX_RETRIES) Utilities.sleep(RETRY_DELAY_MS);
        continue;
      }

      var json = JSON.parse(body);
      if (!json || json.success !== true || !Array.isArray(json.orders)) {
        Logger.log("❌ Unexpected API response format. attempt " + attempt + "/" + MAX_RETRIES);
        Logger.log("   Received: " + body.substring(0, 300));
        lastError = new Error("Unexpected API response. Expected { success: true, orders: [] }");
        if (attempt < MAX_RETRIES) Utilities.sleep(RETRY_DELAY_MS);
        continue;
      }

      Logger.log("✅ Fetched " + json.orders.length + " orders from API (attempt " + attempt + ")");
      return json.orders;
    } catch (e) {
      Logger.log("❌ Fetch error attempt " + attempt + "/" + MAX_RETRIES + ": " + e.toString());
      lastError = e;
      if (attempt < MAX_RETRIES) Utilities.sleep(RETRY_DELAY_MS);
    }
  }

  throw lastError || new Error("Failed to fetch orders after " + MAX_RETRIES + " attempts");
}

// ── Sheet management ──

function getOrCreateSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }

  var firstCell = sh.getRange(1, 1).getValue();
  if (!firstCell || firstCell !== HEADER[0]) {
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
    sh.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }

  return sh;
}

function appendNewRowsOnly(sh, newRows) {
  if (!newRows.length) return 0;

  var lastRow = sh.getLastRow();
  var existingMap = {};

  if (lastRow >= 2) {
    var existingIds = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    existingIds.forEach(function(r) {
      var id = String(r[0]).trim();
      if (id) existingMap[id] = true;
    });
  }

  var toAppend = [];
  newRows.forEach(function(row) {
    var orderId = String(row[0]).trim();
    if (orderId && !existingMap[orderId]) {
      toAppend.push(row);
      existingMap[orderId] = true;
    }
  });

  if (toAppend.length > 0) {
    var startRow = sh.getLastRow() + 1;
    sh.getRange(startRow, 1, toAppend.length, HEADER.length).setValues(toAppend);
    sh.getRange(startRow, 1, toAppend.length, 1).setNumberFormat("@STRING@");
  }

  sh.autoResizeColumns(1, HEADER.length);
  return toAppend.length;
}

// ── Main sync function ──

function syncOrdersToExistingSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startTime = new Date();

  try {
    Object.values(SHEETS).forEach(function(name) {
      getOrCreateSheet(ss, name);
    });

    var orders = fetchOrders();
    var grouped = { completed: {}, failed: {}, cancelled: {} };

    orders.forEach(function(o) {
      var st = safe(o.paymentStatus).toLowerCase();
      // Normalize "pending" to "cancelled" (stale pending = effectively cancelled)
      if (st === "pending") st = "cancelled";
      if (grouped[st] !== undefined) {
        var row = orderToRow(o);
        grouped[st][row[0]] = row;
      }
    });

    Object.keys(grouped).forEach(function(status) {
      var rows = Object.values(grouped[status]);
      rows.sort(function(a, b) {
        var da = new Date(a[10]);
        var db = new Date(b[10]);
        return (isNaN(da) ? 0 : da) - (isNaN(db) ? 0 : db);
      });
      grouped[status] = rows;
    });

    var addedCompleted = appendNewRowsOnly(getOrCreateSheet(ss, SHEETS.completed), grouped.completed);
    var addedFailed = appendNewRowsOnly(getOrCreateSheet(ss, SHEETS.failed), grouped.failed);
    var addedCancelled = appendNewRowsOnly(getOrCreateSheet(ss, SHEETS.cancelled), grouped.cancelled);

    var endTime = new Date();
    var duration = ((endTime - startTime) / 1000).toFixed(1);

    var msg =
      "✅ Sync done @ " + formatIST(endTime) +
      " (" + duration + "s)" +
      " | Fetched: " + orders.length +
      " | Added → Completed: " + addedCompleted +
      ", Failed: " + addedFailed +
      ", Cancelled: " + addedCancelled;

    Logger.log(msg);
    return msg;
  } catch (err) {
    var errorMsg = "❌ Sync FAILED @ " + formatIST(new Date()) + " | Error: " + err.toString();
    Logger.log(errorMsg);
    throw err;
  }
}

// ── Trigger management ──

function setupTrigger() {
  deleteTrigger();
  ScriptApp.newTrigger("syncOrdersToExistingSheets")
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log("✅ 5-minute trigger installed for syncOrdersToExistingSheets");
}

function deleteTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === "syncOrdersToExistingSheets") {
      ScriptApp.deleteTrigger(t);
      Logger.log("Removed trigger: " + t.getUniqueId());
    }
  });
}

function checkTriggerStatus() {
  var triggers = ScriptApp.getProjectTriggers();
  var active = triggers.filter(function(t) {
    return t.getHandlerFunction() === "syncOrdersToExistingSheets";
  });

  if (active.length > 0) {
    Logger.log("✅ Trigger ACTIVE — " + active.length + " trigger(s)");
    Logger.log("   Schedule: Every 5 minutes");
  } else {
    Logger.log("❌ No active trigger. Run setupTrigger() to install.");
  }
}

function manualSync() {
  Logger.log("🔄 Manual sync started @ " + formatIST(new Date()));
  var result = syncOrdersToExistingSheets();
  Logger.log("🔄 Manual sync completed: " + result);
}

// ── Diagnostics: test the API directly ──

function testApi() {
  Logger.log("🔍 Testing API: " + API_URL);
  try {
    var resp = UrlFetchApp.fetch(API_URL, {
      method: "get",
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Google-Apps-Script Orders Sync/1.1"
      }
    });
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    Logger.log("HTTP " + code);
    Logger.log("Response length: " + body.length + " chars");
    if (code === 200) {
      var json = JSON.parse(body);
      Logger.log("success: " + json.success);
      Logger.log("orders count: " + (json.orders ? json.orders.length : "N/A"));
      if (json.orders && json.orders.length > 0) {
        Logger.log("First order sample: " + JSON.stringify(json.orders[0], null, 2).substring(0, 500));
      }
    } else {
      Logger.log("Response preview: " + body.substring(0, 500));
    }
  } catch (e) {
    Logger.log("❌ Test failed: " + e.toString());
  }
}

// ── Phone number cleanup utility ──

function cleanAllPhoneNumbers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var totalCleaned = 0;

  sheets.forEach(function(sh) {
    var lastRow = sh.getLastRow();
    if (lastRow <= 1) return;

    var phoneRange = sh.getRange(2, 5, lastRow - 1, 1);
    var phoneValues = phoneRange.getValues();
    var cleanedValues = phoneValues.map(function(row) {
      var phone = row[0];
      if (!phone) return [phone];
      var cleaned = String(phone).trim();
      var original = cleaned;
      cleaned = cleaned.replace(/^\+91|^91/, "");
      cleaned = cleaned.trim() || "--";
      if (original !== cleaned) totalCleaned++;
      return [cleaned];
    });
    phoneRange.setValues(cleanedValues);
  });

  var msg = "Phone cleanup complete! Cleaned " + totalCleaned + " numbers.";
  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}