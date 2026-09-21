(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborSalesCustomerRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";
  const SALE_STATUS_OPTIONS = ["Draft", "Reserved", "Pending", "Completed", "Cancelled"];

  function create(deps = {}) {
    const required = [
      "getState", "replaceState", "getCurrentRoute", "getAppVersion", "$", "$$", "esc",
      "formatMoney", "toast", "headerHtml", "statCard", "emptyState", "field",
      "textareaField", "selectField", "detailField", "formatDate", "todayISO", "uid",
      "recordActivity", "saveState", "scheduleUiWork", "openModal", "closeModal",
      "navigate", "allowsAnimalTransition", "rememberBreed"
    ];
    for (const name of required) {
      if (typeof deps[name] !== "function") throw new Error(`Sales/Customer runtime requires ${name}().`);
    }

    const {
      replaceState, getCurrentRoute, getAppVersion, $, $$, esc, formatMoney, toast,
      headerHtml, statCard, emptyState, field, textareaField, selectField, detailField,
      formatDate, todayISO, uid, recordActivity, saveState, scheduleUiWork, openModal,
      closeModal, navigate, allowsAnimalTransition, rememberBreed
    } = deps;
    const stateNow = () => deps.getState() || {};
    const confirm = typeof root?.confirm === "function" ? root.confirm.bind(root) : () => false;
    let salesView = { status: "Open", search: "" };

    function customerName(customerId) {
      return stateNow().customers.find((customer) => customer.id === customerId)?.name || "Unknown customer";
    }
  
    function saleItems(sale) {
      return Array.isArray(sale?.items) ? sale.items : [];
    }
  
    function saleAnimals(sale) {
      return saleItems(sale)
        .map((item) => stateNow().animals.find((animal) => animal.id === item.animalId))
        .filter(Boolean);
    }
  
    function saleSubtotal(sale) {
      return saleItems(sale).reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0);
    }
  
    function saleTotal(sale) {
      return Math.max(0, saleSubtotal(sale) - Number(sale?.discount || 0) + Number(sale?.tax || 0));
    }
  
    function salePayments(saleId) {
      return stateNow().payments
        .filter((payment) => payment.saleId === saleId)
        .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")) || String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
    }
  
    function salePaid(saleId) {
      return salePayments(saleId).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    }
  
    function saleBalance(sale) {
      return Math.max(0, saleTotal(sale) - salePaid(sale.id));
    }
  
    function saleNumberForId(id, date = todayISO()) {
      const suffix = String(id || uid("sale")).replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase().padStart(6, "0");
      return `HH-${String(date || todayISO()).slice(0, 4)}-${suffix}`;
    }
  
    function saleAnimalLabel(sale) {
      const animals = saleAnimals(sale);
      if (!animals.length) return "No animal linked";
      if (animals.length === 1) return animals[0].name || "Unnamed animal";
      return `${animals[0].name || "Animal"} + ${animals.length - 1} more`;
    }
  
    function syncSalePaymentIncome(payment) {
      const sale = stateNow().sales.find((record) => record.id === payment.saleId);
      const existing = stateNow().transactions.find((transaction) =>
        transaction.id === payment.transactionId ||
        (transaction.sourceType === "sale-payment" && transaction.sourceId === payment.id)
      );
      const amount = Number(payment.amount || 0);
      if (!sale || !(amount > 0)) {
        if (existing) stateNow().transactions = stateNow().transactions.filter((transaction) => transaction.id !== existing.id);
        payment.transactionId = "";
        return;
      }
      const animals = saleAnimals(sale);
      const animal = animals.length === 1 ? animals[0] : null;
      const now = new Date().toISOString();
      const linked = {
        date: payment.date,
        type: "Income",
        classification: "",
        category: "Animal Sales",
        scope: animal ? "Animal" : "Operation",
        species: animal?.species || "",
        animalId: animal?.id || "",
        amount: amount.toFixed(2),
        party: customerName(sale.customerId),
        description: `${payment.type || "Payment"} received for ${sale.saleNumber}`,
        notes: [payment.method, payment.reference, payment.notes].filter(Boolean).join(" · "),
        sourceType: "sale-payment",
        sourceId: payment.id,
        saleId: sale.id
      };
      if (existing) {
        Object.assign(existing, linked, { updatedAt: now });
        payment.transactionId = existing.id;
      } else {
        const transaction = { id: uid("transaction"), ...linked, createdAt: now };
        stateNow().transactions.push(transaction);
        payment.transactionId = transaction.id;
      }
    }
  
    function applySaleAnimalStatuses(sale, previousSale = null) {
      const nextIds = new Set(saleItems(sale).map((item) => item.animalId));
      const previousIds = new Set(saleItems(previousSale).map((item) => item.animalId));
      previousIds.forEach((animalId) => {
        if (nextIds.has(animalId)) return;
        const animal = stateNow().animals.find((item) => item.id === animalId);
        if (animal?.saleRecordId !== sale.id) return;
        animal.status = "For Sale";
        animal.saleRecordId = "";
        animal.updatedAt = new Date().toISOString();
      });
      saleItems(sale).forEach((item) => {
        const animal = stateNow().animals.find((record) => record.id === item.animalId);
        if (!animal) return;
        if (sale.status === "Reserved") {
          animal.status = "Reserved";
          animal.saleRecordId = sale.id;
        } else if (sale.status === "Completed") {
          animal.status = "Sold";
          animal.saleRecordId = sale.id;
        } else if (animal.saleRecordId === sale.id) {
          animal.status = "For Sale";
          animal.saleRecordId = "";
        }
        animal.updatedAt = new Date().toISOString();
      });
    }
  
    function renderSales() {
      const search = salesView.search.toLowerCase();
      const sales = [...stateNow().sales]
        .filter((sale) => {
          const matchesStatus = salesView.status === "All" ||
            (salesView.status === "Open" ? ["Draft", "Reserved", "Pending"].includes(sale.status) : sale.status === salesView.status);
          const haystack = [sale.saleNumber, customerName(sale.customerId), saleAnimalLabel(sale), sale.notes, sale.transferNumber].join(" ").toLowerCase();
          return matchesStatus && (!search || haystack.includes(search));
        })
        .sort((left, right) => String(right.saleDate || "").localeCompare(String(left.saleDate || "")) || String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
      const customers = [...stateNow().customers]
        .filter((customer) => !search || [customer.name, customer.email, customer.phone, customer.address].join(" ").toLowerCase().includes(search))
        .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
      const available = stateNow().animals.filter((animal) => animal.status === "For Sale").length;
      const reserved = stateNow().animals.filter((animal) => animal.status === "Reserved").length;
      const outstanding = stateNow().sales
        .filter((sale) => !["Cancelled"].includes(sale.status))
        .reduce((sum, sale) => sum + saleBalance(sale), 0);
  
      $("#view-sales").innerHTML = `
        ${headerHtml(
          "Sales & customers",
          "Manage buyers, reservations, deposits, payments, documents, QR cards, and animal transfers.",
          `<label class="button button-ghost" for="transfer-import-file">Import transfer</label>
           <input class="hidden" id="transfer-import-file" type="file" accept="application/json,.json">
           <button class="button button-ghost" id="add-customer">+ Customer</button>
           <button class="button button-primary" id="add-sale">+ Sale</button>`
        )}
        <div class="stats-grid">
          ${statCard("Available animals", available, "Status: For Sale")}
          ${statCard("Reserved", reserved, "Held for a buyer")}
          ${statCard("Customers", stateNow().customers.length, "Buyer and contact records")}
          ${statCard("Outstanding", formatMoney(outstanding), "Unpaid invoice balances")}
        </div>
        <div class="toolbar">
          <input id="sales-search" type="search" value="${esc(salesView.search)}" placeholder="Search sale, customer, animal, or transfer number">
          <select id="sales-status-filter">${["Open", "Draft", "Reserved", "Completed", "Cancelled", "All"].map((status) => `<option ${status === salesView.status ? "selected" : ""}>${status}</option>`).join("")}</select>
        </div>
        <section class="panel" style="margin-bottom:18px">
          <div class="panel-header"><div><h3>Sales and reservations</h3><small>${sales.length} matching record${sales.length === 1 ? "" : "s"}</small></div></div>
          ${sales.length ? `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Sale</th><th>Customer</th><th>Animal</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th><th></th></tr></thead>
            <tbody>${sales.map((sale) => `<tr>
              <td><strong>${esc(sale.saleNumber)}</strong><br><small>${esc(formatDate(sale.saleDate))}</small></td>
              <td>${esc(customerName(sale.customerId))}</td>
              <td>${esc(saleAnimalLabel(sale))}</td>
              <td><span class="badge ${sale.status === "Completed" ? "green" : sale.status === "Reserved" ? "warning" : "gray"}">${esc(sale.status)}</span></td>
              <td>${formatMoney(saleTotal(sale))}</td><td>${formatMoney(salePaid(sale.id))}</td>
              <td class="transaction-amount ${saleBalance(sale) > 0 ? "expense" : "income"}">${formatMoney(saleBalance(sale))}</td>
              <td><button class="button button-ghost button-small" data-view-sale="${sale.id}">View</button></td>
            </tr>`).join("")}</tbody></table></div>` : emptyState("No matching sales.", "Create a sale to reserve an animal, record a deposit, or prepare buyer documents.")}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3>Customers</h3><small>${customers.length} matching contact${customers.length === 1 ? "" : "s"}</small></div></div>
          ${customers.length ? `<div class="data-table-wrap"><table class="data-table">
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Sales</th><th></th></tr></thead>
            <tbody>${customers.map((customer) => `<tr><td><strong>${esc(customer.name)}</strong></td><td>${esc(customer.phone || "—")}</td><td>${esc(customer.email || "—")}</td><td>${esc(customer.address || "—")}</td><td>${stateNow().sales.filter((sale) => sale.customerId === customer.id).length}</td><td><button class="button button-ghost button-small" data-edit-customer="${customer.id}">Edit</button></td></tr>`).join("")}</tbody>
          </table></div>` : emptyState("No customers yet.", "Save a buyer once, then reuse the contact on reservations, invoices, receipts, and transfers.")}
        </section>`;
  
      $("#add-customer").addEventListener("click", () => openCustomerForm());
      $("#add-sale").addEventListener("click", () => openSaleForm());
      $("#transfer-import-file").addEventListener("change", handleTransferImport);
      $("#sales-search").addEventListener("input", (event) => {
        salesView.search = event.currentTarget.value;
        scheduleUiWork("sales-search", () => {
          if (getCurrentRoute() !== "sales") return;
          renderSales();
          const input = $("#sales-search");
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        });
      });
      $("#sales-status-filter").addEventListener("change", (event) => {
        salesView.status = event.currentTarget.value;
        renderSales();
      });
      $$('[data-view-sale]', $("#view-sales")).forEach((button) => button.addEventListener("click", () => openSaleDetail(button.dataset.viewSale)));
      $$('[data-edit-customer]', $("#view-sales")).forEach((button) => button.addEventListener("click", () => openCustomerForm(button.dataset.editCustomer)));
    }
  
    function openCustomerForm(id = "") {
      const customer = stateNow().customers.find((record) => record.id === id) || {};
      openModal(id ? "Edit customer" : "Add customer", `
        <form id="customer-form"><div class="form-grid two">
          ${field("Customer name", "name", customer.name, true)}
          ${field("Phone", "phone", customer.phone, false, "tel")}
          ${field("Email", "email", customer.email, false, "email")}
          ${field("Mailing address", "address", customer.address)}
        </div>${textareaField("Customer notes", "notes", customer.notes)}
        <div class="modal-actions">${id ? '<button type="button" class="button button-danger" id="delete-customer">Delete</button>' : ""}<button type="button" class="button button-ghost" id="cancel-modal">Cancel</button><button type="submit" class="button button-primary">Save customer</button></div></form>
      `, "Buyer record");
      $("#cancel-modal").addEventListener("click", closeModal);
      $("#customer-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const previousState = structuredClone(stateNow());
        const now = new Date().toISOString();
        if (id) Object.assign(customer, data, { updatedAt: now });
        else stateNow().customers.push({ id: uid("customer"), ...data, createdAt: now, updatedAt: now });
        stateNow().sales
          .filter((sale) => sale.customerId === customer.id)
          .flatMap((sale) => salePayments(sale.id))
          .forEach((payment) => syncSalePaymentIncome(payment));
        recordActivity(`${id ? "Updated" : "Added"} customer ${data.name}.`, "sales");
        if (!saveState(id ? "Customer updated." : "Customer added.")) {
          replaceState(previousState);
          return;
        }
        closeModal();
        renderSales();
      });
      $("#delete-customer")?.addEventListener("click", () => {
        if (stateNow().sales.some((sale) => sale.customerId === id)) {
          toast("This customer is connected to a sale and must be kept for document history.", "error");
          return;
        }
        if (!confirm(`Delete ${customer.name}?`)) return;
        const previousState = structuredClone(stateNow());
        stateNow().customers = stateNow().customers.filter((record) => record.id !== id);
        if (!saveState("Customer deleted.")) {
          replaceState(previousState);
          return;
        }
        closeModal();
        renderSales();
      });
    }
  
    function openSaleForm(id = "") {
      if (!stateNow().customers.length) {
        toast("Add the buyer first, then create the sale.", "error");
        openCustomerForm();
        return;
      }
      const existing = stateNow().sales.find((record) => record.id === id);
      const saleId = existing?.id || uid("sale");
      const draft = existing || {
        id: saleId,
        saleDate: todayISO(),
        dueDate: todayISO(),
        status: "Draft",
        customerId: stateNow().customers[0]?.id || "",
        items: [],
        discount: "0.00",
        tax: "0.00",
        notes: "",
        terms: "Payment due upon pickup unless otherwise agreed."
      };
      const selectedItems = new Map(saleItems(draft).map((item) => [item.animalId, item]));
      const candidates = stateNow().animals.filter((animal) =>
        selectedItems.has(animal.id) || !["Sold", "Deceased", "Archived", "Ancestor Only"].includes(animal.status)
      );
      if (!candidates.length) {
        toast("Add an eligible animal before creating a sale.", "error");
        return;
      }
      openModal(id ? `Edit ${draft.saleNumber}` : "Create animal sale", `
        <form id="sale-form">
          <div class="form-grid two">
            <label>Customer<select name="customerId" required>${stateNow().customers.map((customer) => `<option value="${esc(customer.id)}" ${customer.id === draft.customerId ? "selected" : ""}>${esc(customer.name)}</option>`).join("")}</select></label>
            ${selectField("Sale status", "status", SALE_STATUS_OPTIONS, draft.status || "Draft", true)}
            ${field("Sale date", "saleDate", draft.saleDate || todayISO(), true, "date")}
            ${field("Payment due date", "dueDate", draft.dueDate || draft.saleDate || todayISO(), false, "date")}
            ${field("Discount", "discount", draft.discount || "0.00", false, "number")}
            ${field("Tax / fees", "tax", draft.tax || "0.00", false, "number")}
          </div>
          <h3 style="margin-top:20px">Animals and prices</h3>
          <div class="sale-animal-picker">
            ${candidates.map((animal) => {
              const item = selectedItems.get(animal.id);
              return `<label class="sale-animal-choice sale-price-row">
                <input type="checkbox" data-sale-animal value="${animal.id}" ${item ? "checked" : ""}>
                <span><strong>${esc(animal.name || "Unnamed animal")}</strong><small>${esc([animal.earTagNumber || animal.tag || animal.tattoo, animal.earTagColor, animal.species, animal.status].filter(Boolean).join(" · "))}</small></span>
                <input type="number" data-sale-price min="0" step="0.01" value="${esc(item?.unitPrice ?? animal.askingPrice ?? "")}" placeholder="Price" aria-label="Price for ${esc(animal.name || "animal")}">
              </label>`;
            }).join("")}
          </div>
          <div class="sale-total-preview"><span>Invoice total</span><strong id="sale-total-preview">${formatMoney(saleTotal(draft))}</strong></div>
          ${textareaField("Terms", "terms", draft.terms)}
          ${textareaField("Sale notes", "notes", draft.notes)}
          <p class="budget-note">Reserved marks the selected animals Reserved. Completed marks them Sold. Deposits and payments are recorded after the sale is saved and each received payment links to Budget automatically.</p>
          <div class="modal-actions">${id ? '<button type="button" class="button button-danger" id="delete-sale">Delete</button>' : ""}<button type="button" class="button button-ghost" id="cancel-modal">Cancel</button><button type="submit" class="button button-primary">Save sale</button></div>
        </form>`, "Sale, reservation, and buyer documents");
      $(".modal").classList.add("modal-wide");
      const form = $("#sale-form");
      const refreshTotal = () => {
        const subtotal = $$('[data-sale-animal]:checked', form).reduce((sum, box) => sum + Number(box.closest(".sale-price-row").querySelector("[data-sale-price]").value || 0), 0);
        const discount = Number($('[name="discount"]', form).value || 0);
        const tax = Number($('[name="tax"]', form).value || 0);
        $("#sale-total-preview").textContent = formatMoney(Math.max(0, subtotal - discount + tax));
      };
      $$('[data-sale-animal], [data-sale-price], [name="discount"], [name="tax"]', form).forEach((input) => input.addEventListener("input", refreshTotal));
      refreshTotal();
      $("#cancel-modal").addEventListener("click", closeModal);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const discount = Number(data.discount || 0);
        const tax = Number(data.tax || 0);
        if (!Number.isFinite(discount) || discount < 0 || !Number.isFinite(tax) || tax < 0) {
          toast("Discount and tax or fees must be valid amounts of zero or more.", "error");
          return;
        }
        const previousSale = existing ? structuredClone(existing) : null;
        const items = $$('[data-sale-animal]:checked', form).map((box) => {
          const animalId = box.value;
          const prior = selectedItems.get(animalId);
          const animal = stateNow().animals.find((record) => record.id === animalId);
          const price = Number(box.closest(".sale-price-row").querySelector("[data-sale-price]").value || 0);
          const firstCompletion = data.status === "Completed" && (previousSale?.status !== "Completed" || !prior);
          const askingPriceAtCompletion = Number(animal?.askingPrice);
          const listedPriceAtSale = firstCompletion
            ? (animal?.askingPrice === "" || animal?.askingPrice === null || animal?.askingPrice === undefined || !Number.isFinite(askingPriceAtCompletion) ? null : askingPriceAtCompletion.toFixed(2))
            : (prior?.listedPriceAtSale ?? null);
          return {
            id: prior?.id || `saleitem_${saleId}_${animalId.replace(/[^a-z0-9_-]/gi, "")}`,
            animalId,
            quantity: "1",
            unitPrice: price.toFixed(2),
            salePrice: price.toFixed(2),
            listedPriceAtSale
          };
        });
        if (!items.length) {
          toast("Choose at least one animal for this sale.", "error");
          return;
        }
        const invalidPrice = items.some((item) => !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0);
        if (invalidPrice) {
          toast("Enter a valid price of zero or more for every selected animal.", "error");
          return;
        }
        const conflict = data.status !== "Cancelled" && stateNow().sales.find((sale) => sale.id !== saleId && sale.status !== "Cancelled" && saleItems(sale).some((item) => items.some((next) => next.animalId === item.animalId)));
        if (conflict) {
          toast(`One selected animal is already connected to ${conflict.saleNumber}.`, "error");
          return;
        }
        const proposedTotal = Math.max(0, items.reduce((sum, item) => sum + Number(item.unitPrice || 0), 0) - discount + tax);
        const alreadyPaid = salePaid(saleId);
        if (alreadyPaid > proposedTotal + 0.005) {
          toast(`This sale already has ${formatMoney(alreadyPaid)} in payments. Its total cannot be reduced below that amount.`, "error");
          return;
        }
        const previousState = structuredClone(stateNow());
        const now = new Date().toISOString();
        const saved = {
          id: saleId,
          saleNumber: existing?.saleNumber || saleNumberForId(saleId, data.saleDate),
          transferNumber: existing?.transferNumber || `TR-${saleNumberForId(saleId, data.saleDate).replace(/^HH-/, "")}`,
          customerId: data.customerId,
          saleDate: data.saleDate,
          dueDate: data.dueDate || data.saleDate,
          status: SALE_STATUS_OPTIONS.includes(data.status) ? data.status : "Draft",
          items,
          discount: discount.toFixed(2),
          tax: tax.toFixed(2),
          terms: String(data.terms || "").trim(),
          notes: String(data.notes || "").trim(),
          completedAt: data.status === "Completed"
            ? (previousSale?.status === "Completed" ? (previousSale.completedAt || "") : now)
            : (existing?.completedAt || ""),
          createdAt: existing?.createdAt || now,
          updatedAt: now
        };
        if (existing) Object.assign(existing, saved);
        else stateNow().sales.push(saved);
        applySaleAnimalStatuses(saved, previousSale);
        salePayments(saved.id).forEach((payment) => syncSalePaymentIncome(payment));
        recordActivity(`${id ? "Updated" : "Created"} sale ${saved.saleNumber} for ${customerName(saved.customerId)}.`, "sales");
        if (!saveState(id ? "Sale updated." : "Sale created.")) {
          replaceState(previousState);
          return;
        }
        root.HerdHarborMarket?.recordSaleChange?.(saved, previousSale, stateNow());
        closeModal();
        openSaleDetail(saved.id);
      });
      $("#delete-sale")?.addEventListener("click", () => deleteSaleRecord(saleId));
    }
  
    function openSaleDetail(saleId) {
      const sale = stateNow().sales.find((record) => record.id === saleId);
      if (!sale) return;
      const customer = stateNow().customers.find((record) => record.id === sale.customerId);
      const payments = salePayments(sale.id);
      openModal(sale.saleNumber, `
        <div class="detail-grid">
          ${detailField("Customer", customer?.name)}${detailField("Status", sale.status)}
          ${detailField("Sale date", formatDate(sale.saleDate))}${detailField("Due date", formatDate(sale.dueDate))}
          ${detailField("Invoice total", formatMoney(saleTotal(sale)))}${detailField("Paid", formatMoney(salePaid(sale.id)))}
          ${detailField("Balance due", formatMoney(saleBalance(sale)))}${detailField("Transfer number", sale.transferNumber)}
        </div>
        <h3 style="margin-top:20px">Animals</h3>
        <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Animal</th><th>ID</th><th>Species / breed</th><th>Price</th></tr></thead><tbody>${saleItems(sale).map((item) => {
          const animal = stateNow().animals.find((record) => record.id === item.animalId);
          return `<tr><td><strong>${esc(animal?.name || "Missing animal")}</strong></td><td>${esc(animal?.earTagNumber || animal?.tag || animal?.tattoo || "—")}</td><td>${esc([animal?.species, animal?.breed].filter(Boolean).join(" · ") || "—")}</td><td>${formatMoney(item.unitPrice)}</td></tr>`;
        }).join("")}</tbody></table></div>
        <h3 style="margin-top:20px">Payments</h3>
        ${payments.length ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Method</th><th>Reference</th><th>Amount</th><th></th></tr></thead><tbody>${payments.map((payment) => `<tr><td>${formatDate(payment.date)}</td><td>${esc(payment.type)}</td><td>${esc(payment.method)}</td><td>${esc(payment.reference || "—")}</td><td>${formatMoney(payment.amount)}</td><td><button class="button button-ghost button-small" data-edit-payment="${payment.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>` : emptyState("No payments recorded.", "Add a deposit or payment when money is received.")}
        <p class="muted" style="margin-top:18px">${esc(sale.notes || "No sale notes.")}</p>
        <div class="modal-actions">
          <button class="button button-ghost" id="sale-close">Close</button>
          <button class="button button-ghost" id="sale-invoice">Invoice</button>
          <button class="button button-ghost" id="sale-receipt">Receipt</button>
          <button class="button button-ghost" id="sale-bill">Bill of sale</button>
          <button class="button button-ghost" id="sale-transfer" ${sale.status === "Completed" ? "" : "disabled"}>Transfer file</button>
          <button class="button button-secondary" id="sale-payment" ${sale.status === "Cancelled" ? "disabled" : ""}>+ Payment</button>
          <button class="button button-primary" id="sale-edit">Edit sale</button>
        </div>`, "Customer, payment, and transfer record");
      $(".modal").classList.add("modal-wide");
      $("#sale-close").addEventListener("click", () => { closeModal(); renderSales(); });
      $("#sale-invoice").addEventListener("click", () => printSaleDocument(sale.id, "Invoice"));
      $("#sale-receipt").addEventListener("click", () => printSaleDocument(sale.id, "Receipt"));
      $("#sale-bill").addEventListener("click", () => printSaleDocument(sale.id, "Bill of Sale"));
      $("#sale-transfer").addEventListener("click", () => exportAnimalTransfer(sale.id));
      $("#sale-payment").addEventListener("click", () => openPaymentForm(sale.id));
      $("#sale-edit").addEventListener("click", () => openSaleForm(sale.id));
      $$('[data-edit-payment]', $("#modal-content")).forEach((button) => button.addEventListener("click", () => openPaymentForm(sale.id, button.dataset.editPayment)));
    }
  
    function openPaymentForm(saleId, paymentId = "") {
      const sale = stateNow().sales.find((record) => record.id === saleId);
      const payment = stateNow().payments.find((record) => record.id === paymentId) || { type: salePayments(saleId).length ? "Payment" : "Deposit", date: todayISO(), method: "Cash", amount: "" };
      if (!sale) return;
      openModal(paymentId ? "Edit payment" : "Record payment", `
        <form id="payment-form"><div class="form-grid two">
          ${selectField("Payment type", "type", PAYMENT_TYPE_OPTIONS, payment.type || "Payment", true)}
          ${field("Date received", "date", payment.date || todayISO(), true, "date")}
          ${field("Amount received", "amount", payment.amount, true, "number")}
          ${selectField("Method", "method", PAYMENT_METHOD_OPTIONS, payment.method || "Cash", true)}
          ${field("Reference / check number", "reference", payment.reference)}
        </div>${textareaField("Payment notes", "notes", payment.notes)}
        <p class="budget-note">Invoice total ${formatMoney(saleTotal(sale))} · currently paid ${formatMoney(salePaid(sale.id))} · balance ${formatMoney(saleBalance(sale))}. Saving this payment creates or updates one linked Animal Sales income transaction in Budget.</p>
        <div class="modal-actions">${paymentId ? '<button type="button" class="button button-danger" id="delete-payment">Delete</button>' : ""}<button type="button" class="button button-ghost" id="cancel-modal">Cancel</button><button type="submit" class="button button-primary">Save payment</button></div></form>
      `, sale.saleNumber);
      $("#cancel-modal").addEventListener("click", closeModal);
      $("#payment-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const amount = Number(data.amount || 0);
        const available = saleBalance(sale) + Number(payment.amount || 0);
        if (!(amount > 0)) {
          toast("Enter a payment greater than zero.", "error");
          return;
        }
        if (amount > available + 0.005) {
          toast(`This payment is greater than the remaining ${formatMoney(available)} balance.`, "error");
          return;
        }
        if (!PAYMENT_METHOD_OPTIONS.includes(data.method)) {
          toast("Choose a valid payment method.", "error");
          return;
        }
        const previousState = structuredClone(stateNow());
        const now = new Date().toISOString();
        const saved = {
          id: paymentId || uid("payment"), saleId, type: PAYMENT_TYPE_OPTIONS.includes(data.type) ? data.type : "Payment",
          date: data.date, amount: amount.toFixed(2), method: data.method, reference: String(data.reference || "").trim(), notes: String(data.notes || "").trim(),
          transactionId: payment.transactionId || "", createdAt: payment.createdAt || now, updatedAt: now
        };
        if (paymentId) Object.assign(payment, saved);
        else stateNow().payments.push(saved);
        syncSalePaymentIncome(saved);
        recordActivity(`Recorded ${saved.type.toLowerCase()} of ${formatMoney(saved.amount)} for ${sale.saleNumber}.`, "sales");
        if (!saveState(paymentId ? "Payment updated." : "Payment recorded.")) {
          replaceState(previousState);
          return;
        }
        closeModal();
        openSaleDetail(saleId);
      });
      $("#delete-payment")?.addEventListener("click", () => {
        if (!confirm("Delete this payment and its linked Budget income?")) return;
        const previousState = structuredClone(stateNow());
        stateNow().payments = stateNow().payments.filter((record) => record.id !== paymentId);
        stateNow().transactions = stateNow().transactions.filter((transaction) => transaction.id !== payment.transactionId && !(transaction.sourceType === "sale-payment" && transaction.sourceId === paymentId));
        if (!saveState("Payment deleted.")) {
          replaceState(previousState);
          return;
        }
        closeModal();
        openSaleDetail(saleId);
      });
    }
  
    function deleteSaleRecord(saleId) {
      const sale = stateNow().sales.find((record) => record.id === saleId);
      if (!sale || !confirm(`Delete ${sale.saleNumber}? Its payments and linked Budget income will also be removed, and its animals will return to For Sale.`)) return;
      const previousState = structuredClone(stateNow());
      const paymentIds = new Set(salePayments(saleId).map((payment) => payment.id));
      stateNow().payments = stateNow().payments.filter((payment) => !paymentIds.has(payment.id));
      stateNow().transactions = stateNow().transactions.filter((transaction) => !(transaction.sourceType === "sale-payment" && paymentIds.has(transaction.sourceId)));
      const cancelled = { ...sale, status: "Cancelled", items: saleItems(sale) };
      applySaleAnimalStatuses(cancelled, sale);
      stateNow().sales = stateNow().sales.filter((record) => record.id !== saleId);
      if (!saveState("Sale deleted.")) {
        replaceState(previousState);
        return;
      }
      root.HerdHarborMarket?.recordSaleChange?.(cancelled, sale, stateNow());
      closeModal();
      renderSales();
    }
  
    function printSaleDocument(saleId, documentType) {
      const sale = stateNow().sales.find((record) => record.id === saleId);
      const customer = stateNow().customers.find((record) => record.id === sale?.customerId);
      if (!sale || !customer) return;
      const payments = salePayments(sale.id);
      const operation = stateNow().profile?.operationName || "HerdHarbor";
      const sellerContact = [stateNow().profile?.ownerName, stateNow().profile?.phone, stateNow().profile?.email, stateNow().profile?.address].filter(Boolean).join(" · ");
      const buyerContact = [customer.phone, customer.email, customer.address].filter(Boolean).join(" · ");
      const popup = root.open("", "_blank");
      if (!popup) {
        toast("Allow pop-ups for HerdHarbor to print sale documents.", "error");
        return;
      }
      popup.opener = null;
      const billDetails = documentType === "Bill of Sale" ? `<section><h2>Animals transferred</h2>${saleAnimals(sale).map((animal) => {
        const sire = stateNow().animals.find((record) => record.id === animal.sireId);
        const dam = stateNow().animals.find((record) => record.id === animal.damId);
        return `<div class="animal"><strong>${esc(animal.name || "Unnamed animal")}</strong><span>${esc([animal.earTagNumber ? `Ear tag ${animal.earTagNumber}` : animal.tag || animal.tattoo, animal.earTagColor, animal.registrationNumber, animal.species, animal.breed, animal.sex, animal.color, animal.dob ? formatDate(animal.dob) : ""].filter(Boolean).join(" · "))}</span><span>Sire: ${esc(sire?.name || "Unknown")} · Dam: ${esc(dam?.name || "Unknown")}</span></div>`;
      }).join("")}</section>` : "";
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(documentType)} ${esc(sale.saleNumber)}</title><style>
        @page{size:letter;margin:.55in}*{box-sizing:border-box}body{margin:0;color:#172b3d;font:12px/1.45 Arial,sans-serif}header{display:flex;justify-content:space-between;gap:25px;padding-bottom:18px;border-bottom:3px solid #0d2540}.brand{font-size:22px;font-weight:900}.doc{text-align:right}.doc h1{margin:0;color:#0d2540;font-size:28px}.muted{color:#64727d}.parties,.totals{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}.box{padding:12px;border:1px solid #ced7dd;border-radius:9px}.box small{display:block;color:#65727e;font-weight:800;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{padding:9px;border-bottom:1px solid #d8e0e5;text-align:left}th{color:white;background:#0d2540}.money{text-align:right}.totals{grid-template-columns:1fr 230px}.summary div{display:flex;justify-content:space-between;padding:5px 0}.summary .grand{padding-top:8px;border-top:2px solid #0d2540;font-size:16px;font-weight:900}.animal{display:grid;gap:4px;margin:8px 0;padding:10px;border:1px solid #ced7dd;border-radius:8px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:35px;margin-top:48px}.signature{padding-top:25px;border-top:1px solid #172b3d}.terms{margin-top:20px;padding:12px;background:#f1f5f5;border-radius:8px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><header><div><div class="brand">${esc(operation)}</div><div class="muted">${esc(sellerContact || "Seller contact not recorded")}</div></div><div class="doc"><h1>${esc(documentType)}</h1><strong>${esc(sale.saleNumber)}</strong><div>${esc(formatDate(sale.saleDate))}</div><div>Transfer: ${esc(sale.transferNumber)}</div></div></header>
      <section class="parties"><div class="box"><small>Seller</small><strong>${esc(stateNow().profile?.ownerName || operation)}</strong><div>${esc(sellerContact || "—")}</div></div><div class="box"><small>Buyer</small><strong>${esc(customer.name)}</strong><div>${esc(buyerContact || "—")}</div></div></section>
      <table><thead><tr><th>Animal</th><th>Identity</th><th>Species / breed</th><th class="money">Price</th></tr></thead><tbody>${saleItems(sale).map((item) => {
        const animal = stateNow().animals.find((record) => record.id === item.animalId);
        return `<tr><td>${esc(animal?.name || "Missing animal")}</td><td>${esc(animal?.earTagNumber || animal?.tag || animal?.tattoo || animal?.registrationNumber || "—")}</td><td>${esc([animal?.species, animal?.breed].filter(Boolean).join(" · ") || "—")}</td><td class="money">${formatMoney(item.unitPrice)}</td></tr>`;
      }).join("")}</tbody></table>
      ${documentType === "Receipt" ? `<section><h2>Payments received</h2><table><thead><tr><th>Date</th><th>Type</th><th>Method / reference</th><th class="money">Amount</th></tr></thead><tbody>${payments.length ? payments.map((payment) => `<tr><td>${esc(formatDate(payment.date))}</td><td>${esc(payment.type)}</td><td>${esc([payment.method, payment.reference].filter(Boolean).join(" · ") || "—")}</td><td class="money">${formatMoney(payment.amount)}</td></tr>`).join("") : '<tr><td colspan="4">No payments recorded.</td></tr>'}</tbody></table></section>` : ""}
      <section class="totals"><div>${billDetails}</div><div class="summary"><div><span>Subtotal</span><strong>${formatMoney(saleSubtotal(sale))}</strong></div><div><span>Discount</span><strong>−${formatMoney(sale.discount)}</strong></div><div><span>Tax / fees</span><strong>${formatMoney(sale.tax)}</strong></div><div><span>Paid</span><strong>${formatMoney(salePaid(sale.id))}</strong></div><div class="grand"><span>Balance due</span><strong>${formatMoney(saleBalance(sale))}</strong></div></div></section>
      <div class="terms"><strong>Terms and notes</strong><p>${esc([sale.terms, sale.notes].filter(Boolean).join(" · ") || "No additional terms recorded.")}</p></div>
      ${documentType === "Bill of Sale" ? '<section class="signatures"><div class="signature">Seller signature / date</div><div class="signature">Buyer signature / date</div></section>' : ""}
      <script>root.addEventListener('load',()=>setTimeout(()=>root.print(),120));<\/script></body></html>`);
      popup.document.close();
    }
  
    function transferableAnimal(animal) {
      return {
        id: animal.id, name: animal.name || "", tag: animal.tag || "", earTagNumber: animal.earTagNumber || "", earTagColor: animal.earTagColor || "", tattoo: animal.tattoo || "", registrationNumber: animal.registrationNumber || "",
        breeder: animal.breeder || "", species: animal.species || "", breed: animal.breed || "", sex: animal.sex || "Unknown", dob: animal.dob || "",
        color: animal.color || "", sireId: animal.sireId || "", damId: animal.damId || ""
      };
    }
  
    function transferRecordKey(value) {
      const source = String(value || "");
      let hash = 2166136261;
      for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      const readable = source.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "transfer";
      return `${readable}_${(hash >>> 0).toString(36)}`;
    }
  
    function transferAnimalsForSale(sale) {
      const subjectIds = new Set(saleItems(sale).map((item) => item.animalId));
      const included = new Set(subjectIds);
      let frontier = [...subjectIds];
      for (let depth = 0; depth < 3; depth += 1) {
        const next = [];
        frontier.forEach((id) => {
          const animal = stateNow().animals.find((record) => record.id === id);
          [animal?.sireId, animal?.damId].filter(Boolean).forEach((parentId) => {
            if (included.has(parentId)) return;
            included.add(parentId);
            next.push(parentId);
          });
        });
        frontier = next;
      }
      return { subjectIds: [...subjectIds], animals: [...included].map((id) => stateNow().animals.find((record) => record.id === id)).filter(Boolean).map(transferableAnimal) };
    }
  
    function exportAnimalTransfer(saleId) {
      const sale = stateNow().sales.find((record) => record.id === saleId);
      const customer = stateNow().customers.find((record) => record.id === sale?.customerId);
      if (!sale || !customer) return;
      if (sale.status !== "Completed") {
        toast("Complete the sale before creating its animal transfer file.", "error");
        return;
      }
      const transfer = transferAnimalsForSale(sale);
      const payload = {
        app: "HerdHarbor",
        version: getAppVersion(),
        type: "animal-transfer",
        transferId: sale.transferNumber,
        exportedAt: new Date().toISOString(),
        sender: { operationName: stateNow().profile?.operationName || "", ownerName: stateNow().profile?.ownerName || "", email: stateNow().profile?.email || "", phone: stateNow().profile?.phone || "" },
        recipient: { name: customer.name, email: customer.email || "", phone: customer.phone || "" },
        sale: { saleNumber: sale.saleNumber, saleDate: sale.saleDate, transferNumber: sale.transferNumber },
        subjectIds: transfer.subjectIds,
        animals: transfer.animals
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = root.document.createElement("a");
      link.href = url;
      link.download = `${sale.transferNumber.toLowerCase()}-herdharbor-transfer.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Animal transfer file downloaded.", "success");
    }
  
    function transferMatch(animal) {
      const fields = ["registrationNumber", "tattoo", "tag"];
      for (const fieldName of fields) {
        const value = String(animal[fieldName] || "").trim().toLowerCase();
        if (!value) continue;
        const matches = stateNow().animals.filter((record) => String(record[fieldName] || "").trim().toLowerCase() === value);
        if (matches.length === 1) return matches[0];
      }
      return null;
    }
  
    async function handleTransferImport(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      let previousState = null;
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error("Animal transfer files must be 2 MB or smaller.");
        const payload = JSON.parse(await file.text());
        if (payload?.type !== "animal-transfer" || typeof payload.transferId !== "string" || !payload.transferId.trim() || !Array.isArray(payload.animals) || !Array.isArray(payload.subjectIds)) {
          throw new Error("This is not a valid HerdHarbor animal transfer file.");
        }
        if (stateNow().transfers.some((record) => record.sourceTransferId === payload.transferId)) {
          throw new Error("This transfer has already been imported into this farm account.");
        }
        if (!payload.animals.length || !payload.subjectIds.length) throw new Error("The transfer file does not contain an animal.");
        if (payload.animals.length > 100) throw new Error("This transfer contains too many animal records.");
        const sourceIds = payload.animals.map((animal) => animal?.id);
        if (sourceIds.some((id) => typeof id !== "string" || !id) || new Set(sourceIds).size !== sourceIds.length) {
          throw new Error("The transfer contains a blank or duplicate animal identifier.");
        }
        if (payload.animals.some((animal) => !String(animal?.name || "").trim() || !String(animal?.species || "").trim())) {
          throw new Error("Every transferred animal must have a name and species.");
        }
        if (payload.subjectIds.some((id) => typeof id !== "string" || !id) || new Set(payload.subjectIds).size !== payload.subjectIds.length) {
          throw new Error("The transfer contains a blank or duplicate subject identifier.");
        }
        const subjectIds = [...payload.subjectIds];
        if (subjectIds.some((id) => !sourceIds.includes(id))) {
          throw new Error("The transfer references a subject animal that is not included in the file.");
        }
        const subjectNames = subjectIds.map((id) => payload.animals.find((animal) => animal.id === id)?.name).filter(Boolean);
        if (!confirm(`Import ${subjectNames.join(", ") || subjectIds.length + " animal(s)"} from ${payload.sender?.operationName || payload.sender?.ownerName || "another HerdHarbor farm"}? Pedigree ancestors will be added as Ancestor Only when they are not already present.`)) return;
        previousState = structuredClone(stateNow());
        const transferKey = transferRecordKey(payload.transferId);
        const idMap = new Map();
        payload.animals.forEach((animal, index) => {
          const existing = transferMatch(animal);
          idMap.set(animal.id, existing?.id || `animal_received_${transferKey}_${String(index + 1).padStart(3, "0")}`);
        });
        const now = new Date().toISOString();
        const added = [];
        payload.animals.forEach((source) => {
          const mappedId = idMap.get(source.id);
          if (stateNow().animals.some((animal) => animal.id === mappedId)) return;
          const subject = subjectIds.includes(source.id);
          const animal = {
            ...transferableAnimal(source),
            id: mappedId,
            sireId: idMap.get(source.sireId) || "",
            damId: idMap.get(source.damId) || "",
            status: subject ? "Active" : "Ancestor Only",
            location: "",
            saleRecordId: "",
            sourceBirthId: "",
            notes: subject ? `Received through HerdHarbor transfer ${payload.transferId}.` : "",
            createdAt: now,
            updatedAt: now
          };
          added.push(animal);
        });
        if (!allowsAnimalTransition(stateNow().animals, [...stateNow().animals, ...added])) {
          replaceState(previousState);
          previousState = null;
          return;
        }
        stateNow().animals.push(...added);
        added.forEach((animal) => rememberBreed(animal.species, animal.breed));
        const subjectAnimalIds = subjectIds.map((id) => idMap.get(id)).filter(Boolean);
        stateNow().transfers.push({
          id: `transfer_received_${transferKey}`,
          direction: "Received",
          sourceTransferId: payload.transferId,
          sourceSaleNumber: payload.sale?.saleNumber || "",
          senderName: payload.sender?.operationName || payload.sender?.ownerName || "",
          senderContact: [payload.sender?.ownerName, payload.sender?.email, payload.sender?.phone].filter(Boolean).join(" · "),
          animalIds: subjectAnimalIds,
          createdAt: now
        });
        recordActivity(`Imported transfer ${payload.transferId}: ${subjectNames.join(", ") || subjectAnimalIds.length + " animal(s)"}.`, "sales");
        if (!saveState()) {
          replaceState(previousState);
          previousState = null;
          throw new Error("The transfer was rolled back because this device could not safely save every record.");
        }
        previousState = null;
        toast(`Transfer imported: ${subjectAnimalIds.length} animal${subjectAnimalIds.length === 1 ? "" : "s"} plus ${Math.max(0, added.length - subjectAnimalIds.length)} new ancestor record${Math.max(0, added.length - subjectAnimalIds.length) === 1 ? "" : "s"}.`, "success");
        navigate("animals");
      } catch (error) {
        if (previousState) replaceState(previousState);
        toast(error.message || "The animal transfer could not be imported.", "error");
      } finally {
        event.target.value = "";
      }
    }
  
  

    return Object.freeze({
      VERSION,
      customerName,
      saleItems,
      saleAnimals,
      saleSubtotal,
      saleTotal,
      salePayments,
      salePaid,
      saleBalance,
      saleNumberForId,
      saleAnimalLabel,
      syncSalePaymentIncome,
      applySaleAnimalStatuses,
      renderSales,
      openCustomerForm,
      openSaleForm,
      openSaleDetail,
      openPaymentForm,
      deleteSaleRecord,
      printSaleDocument,
      transferableAnimal,
      transferRecordKey,
      transferAnimalsForSale,
      exportAnimalTransfer,
      transferMatch,
      handleTransferImport,
      getFilterState: () => ({ ...salesView })
    });
  }

  return Object.freeze({ VERSION, SALE_STATUS_OPTIONS, create });
});
