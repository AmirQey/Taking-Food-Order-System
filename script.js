/* =========================================================
           Data (saved in this browser's localStorage)
           ========================================================= */
        const STORE_KEY = "foodOrdering.v1";
        const CATEGORIES = [
            { key: "mains",    label: "Mains" },
            { key: "drinks",   label: "Drinks" },
            { key: "desserts", label: "Desserts" },
            { key: "bites",    label: "Bites" }
        ];
        const METHODS = ["Cash", "Card", "QR / E-wallet"];

        const uid = () => Math.random().toString(36).slice(2, 9);
        const mk = (name, price) => ({ id: uid(), name, price });

        function defaults() {
            return {
                menu: {
                    bites: [mk("French Fries", 6.00), mk("Chicken Nuggets", 8.00), mk("Garlic Bread", 5.50)],
                    mains: [mk("Nasi Lemak Ayam Goreng", 12.90), mk("Grilled Chicken Chop", 15.00), mk("Spaghetti Carbonara", 14.50)],
                    drinks: [mk("Iced Milk Tea", 4.50), mk("Fresh Orange Juice", 6.00), mk("Hot Americano", 7.00)],
                    desserts: [mk("Chocolate Lava Cake", 10.00), mk("Burnt Cheesecake", 12.00), mk("Vanilla Ice Cream", 3.50)]
                },
                employees: ["Amir", "Muadz", "Qayyiz", "Iskandar"],
                tables: [1, 2, 3, 4, 5, 6],
                orders: [],
                paid: [],
                nextOrder: 1
            };
        }

        function load() {
            try {
                const raw = localStorage.getItem(STORE_KEY);
                if (raw) return Object.assign(defaults(), JSON.parse(raw));
            } catch (e) { /* fall through to defaults */ }
            return defaults();
        }

        let db = load();

        function save() {
            try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
            catch (e) { toast("Could not save. Browser storage may be full or blocked."); }
        }

        /* =========================================================
           Helpers
           ========================================================= */
        const $ = s => document.querySelector(s);
        const pad = n => String(n).padStart(2, "0");
        const RM = n => "RM " + Number(n).toFixed(2);
        const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        const clone = o => JSON.parse(JSON.stringify(o));
        const orderTotal = items => items.reduce((s, l) => s + l.price * l.qty, 0);
        const orderLabel = id => "#" + id;

        function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
        const todayStr = () => dateStr(new Date());
        const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

        function fmtTime(t) {
            if (!t) return "-";
            const [h, m] = t.split(":").map(Number);
            return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
        }

        function fmtDate(d) {
            if (!d) return "-";
            const [y, m, day] = d.split("-");
            return `${day}/${m}/${y}`;
        }

        let toastTimer;
        function toast(msg) {
            const t = $("#toast");
            t.textContent = msg;
            t.classList.add("show");
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
        }

        const findOrder = id => db.orders.find(o => o.id === id);
        const findPaid = id => db.paid.find(o => o.id === id);
        const byDateTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.id.localeCompare(b.id);

        /* =========================================================
           Routing
           ========================================================= */
        const VIEWS = ["order", "queue", "paid", "settings", "revenue"];
        let setTab = "menu";
        let setCat = "mains";

        function route() {
            const [view, sub] = (location.hash.slice(1) || "order").split("/");
            const v = VIEWS.includes(view) ? view : "order";
            if (v === "settings" && ["menu", "employee", "table"].includes(sub)) setTab = sub;

            document.querySelectorAll(".view").forEach(s => { s.hidden = s.id !== "view-" + v; });
            document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === v));
            document.querySelectorAll("[data-sub]").forEach(a => a.classList.toggle("active", v === "settings" && a.dataset.sub === setTab));

            if (v === "order") { populateSelects(); displayMenu(); }
            if (v === "queue") renderQueue();
            if (v === "paid") renderPaid();
            if (v === "settings") renderSettings();
            if (v === "revenue") renderRevenue();
        }

        window.addEventListener("hashchange", route);

        /* =========================================================
           ORDER PAGE
           ========================================================= */
        let draft = [];          // [{ id, name, price, qty, notes }]
        let editingId = null;

        function populateSelects(extraEmployee, extraTable) {
            const emp = $("#employees");
            const tbl = $("#tables");
            const curEmp = extraEmployee || emp.value;
            const curTbl = extraTable != null ? String(extraTable) : tbl.value;

            const employees = db.employees.slice();
            if (curEmp && !employees.includes(curEmp) && editingId) employees.push(curEmp);
            const tables = db.tables.slice();
            if (curTbl && !tables.includes(Number(curTbl)) && editingId) tables.push(Number(curTbl));
            tables.sort((a, b) => a - b);

            emp.innerHTML = employees.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
            tbl.innerHTML = tables.map(n => `<option value="${n}">${n}</option>`).join("");
            if (employees.includes(curEmp)) emp.value = curEmp;
            if (tables.map(String).includes(curTbl)) tbl.value = curTbl;
        }

        function setFormDefaults() {
            $("#order-date").value = todayStr();
            $("#order-time").value = nowTime();
        }

        function displayMenu() {
            const chosen = $("#category").value;
            $("#list").innerHTML = db.menu[chosen].length
                ? db.menu[chosen].map((item, i) => `
                    <tr onclick="addToOrder('${item.id}')">
                        <td class="col-no">${pad(i + 1)}</td>
                        <td class="col-name">${esc(item.name)}</td>
                        <td class="col-price">${RM(item.price)}</td>
                    </tr>`).join("")
                : `<tr><td colspan="3" style="text-align:center;padding:24px 0;">No items. Add some in Settings.</td></tr>`;
        }

        function addToOrder(itemId, qty = 1, notes = "") {
            const item = Object.values(db.menu).flat().find(i => i.id === itemId);
            if (!item) return;
            const existing = draft.find(l => l.id === itemId);
            if (existing) {
                existing.qty += qty;
                if (notes) existing.notes = existing.notes ? existing.notes + ", " + notes : notes;
            } else {
                draft.push({ id: item.id, name: item.name, price: item.price, qty, notes });
            }
            displayOrder();
        }

        function changeQty(id, delta) {
            const line = draft.find(l => l.id === id);
            if (!line) return;
            line.qty += delta;
            if (line.qty < 1) draft = draft.filter(l => l.id !== id);
            displayOrder();
        }

        function updateNotes(id, value) {
            const line = draft.find(l => l.id === id);
            if (line) line.notes = value;   // no redraw so typing isn't interrupted
        }

        function displayOrder() {
            const tbody = $("#order-list");
            if (!draft.length) {
                tbody.innerHTML = `<tr class="empty"><td colspan="6">No items yet. Tap a menu item to add it.</td></tr>`;
            } else {
                tbody.innerHTML = draft.map((line, i) => `
                    <tr>
                        <td class="c-no left">${pad(i + 1)}</td>
                        <td class="c-name left wrap">${esc(line.name)}</td>
                        <td class="c-qty">
                            <div class="qty-control">
                                <button type="button" class="qty-btn" aria-label="Remove one ${esc(line.name)}" onclick="changeQty('${line.id}', -1)">-</button>
                                <span class="qty-num">${line.qty}</span>
                                <button type="button" class="qty-btn" aria-label="Add one ${esc(line.name)}" onclick="changeQty('${line.id}', 1)">+</button>
                            </div>
                        </td>
                        <td class="c-notes">
                            <input class="notes-input" type="text" value="${esc(line.notes)}" aria-label="Note for ${esc(line.name)}"
                                   oninput="updateNotes('${line.id}', this.value)">
                        </td>
                        <td class="c-price">${RM(line.price)}</td>
                        <td class="c-total">${RM(line.price * line.qty)}</td>
                    </tr>`).join("");
            }
            $("#draft-total").textContent = RM(orderTotal(draft));
            $("#draft-title").textContent = editingId ? `Editing order ${orderLabel(editingId)}` : "Current order";
            $("#submit-btn").textContent = editingId ? "Save Changes" : "Add Order";
        }

        function readForm() {
            return {
                employee: $("#employees").value,
                table: Number($("#tables").value),
                date: $("#order-date").value || todayStr(),
                time: $("#order-time").value || nowTime(),
                takeaway: $("#takeaway").checked
            };
        }

        $("#order-form").addEventListener("submit", e => {
            e.preventDefault();
            if (!draft.length) { toast("Add at least one item first."); return; }
            const info = readForm();
            if (!info.employee) { toast("Add an employee in Settings first."); return; }
            if (!info.table) { toast("Add a table in Settings first."); return; }

            const items = clone(draft);
            const total = orderTotal(items);

            if (editingId) {
                const o = findOrder(editingId);
                if (o) Object.assign(o, info, { items, total });
                toast(`Order ${orderLabel(editingId)} updated.`);
            } else {
                const id = String(db.nextOrder++).padStart(3, "0");
                db.orders.push(Object.assign({ id }, info, { items, total }));
                toast(`Order ${orderLabel(id)} added to the queue.`);
            }
            save();
            $("#order-form").reset();
        });

        // Clear button (type=reset) also empties the order list and cancels editing
        $("#order-form").addEventListener("reset", () => {
            setTimeout(() => {
                draft = [];
                editingId = null;
                setFormDefaults();
                populateSelects();
                displayOrder();
            }, 0);
        });

        $("#category").addEventListener("change", displayMenu);

        /* ---------- Import .txt ----------
           Header lines (all optional):   employee: Amir | table: 3 | date: 2026-09-30 | time: 12:30 | takeaway: yes
           Item lines:                    Item name, quantity, note (quantity and note optional)
        */
        $("#import-file").addEventListener("change", e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { importText(String(reader.result)); e.target.value = ""; };
            reader.readAsText(file);
        });

        function importText(text) {
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const all = Object.values(db.menu).flat();
            const missing = [];
            let added = 0;

            lines.forEach(line => {
                const kv = line.match(/^(employee|table|date|time|takeaway)\s*:\s*(.+)$/i);
                if (kv) {
                    const key = kv[1].toLowerCase();
                    const val = kv[2].trim();
                    if (key === "employee") {
                        const match = db.employees.find(n => n.toLowerCase() === val.toLowerCase());
                        if (match) $("#employees").value = match;
                    } else if (key === "table") {
                        if (db.tables.map(String).includes(val)) $("#tables").value = val;
                    } else if (key === "date") {
                        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) $("#order-date").value = val;
                    } else if (key === "time") {
                        if (/^\d{1,2}:\d{2}$/.test(val)) $("#order-time").value = val.padStart(5, "0");
                    } else if (key === "takeaway") {
                        $("#takeaway").checked = /^(yes|y|true|1|takeaway)$/i.test(val);
                    }
                    return;
                }
                const [name, qty, ...note] = line.split(",").map(s => s.trim());
                const item = all.find(i => i.name.toLowerCase() === name.toLowerCase());
                if (!item) { missing.push(name); return; }
                addToOrder(item.id, Math.max(1, parseInt(qty, 10) || 1), note.join(", "));
                added++;
            });

            let msg = `Imported ${added} item${added === 1 ? "" : "s"}.`;
            if (missing.length) msg += ` Not on the menu: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}`;
            toast(msg);
        }

        /* =========================================================
           Modal helpers
           ========================================================= */
        const dlg = $("#dlg");
        dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

        function closeModal() { dlg.close(); }

        function openModal(html) {
            dlg.innerHTML = html;
            if (!dlg.open) dlg.showModal();
        }

        function itemsList(o) {
            return o.items.map(l => `<li>${l.qty} × ${esc(l.name)} (${RM(l.price * l.qty)})</li>`).join("");
        }

        function notesList(o) {
            const withNotes = o.items.filter(l => l.notes);
            return withNotes.length
                ? withNotes.map(l => `<li>${esc(l.name)}: ${esc(l.notes)}</li>`).join("")
                : "<li>None</li>";
        }

        function viewOrder(o, isPaid) {
            openModal(`
                <div class="modal-card">
                    <h3>View order</h3>
                    <div class="modal-grid">
                        <div>
                            <div class="kv"><span>Order ID:</span><b>${orderLabel(o.id)}</b></div>
                            <div class="kv"><span>Table:</span><b>${o.table}</b></div>
                            <div class="kv"><span>Employee:</span><b>${esc(o.employee)}</b></div>
                            <div class="kv"><span>Takeaway:</span><b>${o.takeaway ? "Yes" : "No"}</b></div>
                            <div class="kv"><span>Date:</span><b>${fmtDate(o.date)}</b></div>
                            <div class="kv"><span>Time:</span><b>${fmtTime(o.time)}</b></div>
                        </div>
                        <div>
                            <div class="kv-block"><span>Items:</span><ul>${itemsList(o)}</ul></div>
                            <div class="kv-block"><span>Notes</span><ul>${notesList(o)}</ul></div>
                            <div class="kv"><span>Total:</span><b>${RM(o.total)}</b></div>
                            ${isPaid ? `
                                <div class="kv"><span>Paid by:</span><b>${esc(o.method)}</b></div>
                                <div class="kv"><span>Received:</span><b>${RM(o.received)}</b></div>
                                <div class="kv"><span>Change:</span><b>${RM(o.change)}</b></div>` : ""}
                        </div>
                    </div>
                    <div class="modal-actions">
                        ${isPaid ? `<button type="button" onclick="printReceipt('${o.id}')">Print</button>` : ""}
                        <button type="button" onclick="closeModal()">Back</button>
                    </div>
                </div>`);
        }

        function printReceipt(id) {
            const o = findPaid(id);
            if (!o) return;
            $("#print-area").innerHTML = `
                <h2>Food Ordering System</h2>
                <div class="center">Receipt ${orderLabel(o.id)}</div>
                <div class="center">${fmtDate(o.date)} ${fmtTime(o.time)}</div>
                <hr>
                <div class="line"><span>Table ${o.table}${o.takeaway ? " (takeaway)" : ""}</span><span>${esc(o.employee)}</span></div>
                <hr>
                ${o.items.map(l => `
                    <div class="line"><span>${l.qty} x ${esc(l.name)}</span><span>${RM(l.price * l.qty)}</span></div>
                    ${l.notes ? `<div class="note">${esc(l.notes)}</div>` : ""}`).join("")}
                <hr>
                <div class="line"><strong>Total</strong><strong>${RM(o.total)}</strong></div>
                <div class="line"><span>${esc(o.method)}</span><span>${RM(o.received)}</span></div>
                <div class="line"><span>Change</span><span>${RM(o.change)}</span></div>
                <hr>
                <div class="center">Thank you!</div>`;
            window.print();
        }

        /* =========================================================
           QUEUE PAGE
           ========================================================= */
        let selQueue = null;

        function renderQueue() {
            const f = $("#queue-date").value;
            const list = db.orders.filter(o => !f || o.date === f).sort(byDateTime);
            if (!list.some(o => o.id === selQueue)) selQueue = null;

            $("#queue-list").innerHTML = list.length
                ? list.map(o => `
                    <tr class="sel-row ${o.id === selQueue ? "selected" : ""}" onclick="selectQueue('${o.id}')">
                        <td class="left">${orderLabel(o.id)}</td>
                        <td class="left">${o.table}</td>
                        <td>${o.takeaway ? "Yes" : "No"}</td>
                        <td>${RM(o.total)}</td>
                        <td>${fmtTime(o.time)}${f ? "" : `<small>${fmtDate(o.date)}</small>`}</td>
                    </tr>`).join("")
                : `<tr class="empty"><td colspan="5">${db.orders.length ? "No orders on this date." : "The queue is empty. Add an order on the Order page."}</td></tr>`;
        }

        function selectQueue(id) {
            selQueue = selQueue === id ? null : id;
            renderQueue();
        }

        $("#queue-date").addEventListener("change", renderQueue);
        $("#queue-all").addEventListener("click", () => { $("#queue-date").value = ""; renderQueue(); });

        function queueAction(action) {
            const o = selQueue && findOrder(selQueue);
            if (!o) { toast("Select an order first."); return; }

            if (action === "view") viewOrder(o, false);
            if (action === "finish") openFinish(o);
            if (action === "remove") {
                if (confirm(`Remove order ${orderLabel(o.id)}? This cannot be undone.`)) {
                    db.orders = db.orders.filter(x => x.id !== o.id);
                    selQueue = null;
                    save();
                    renderQueue();
                    toast(`Order ${orderLabel(o.id)} removed.`);
                }
            }
            if (action === "edit") {
                editingId = o.id;
                draft = clone(o.items);
                populateSelects(o.employee, o.table);
                $("#employees").value = o.employee;
                $("#tables").value = String(o.table);
                $("#order-date").value = o.date;
                $("#order-time").value = o.time;
                $("#takeaway").checked = o.takeaway;
                displayOrder();
                location.hash = "#order";
            }
        }

        /* ---------- Finish order (payment) ---------- */
        function openFinish(o) {
            openModal(`
                <div class="modal-card">
                    <div class="fin-head">
                        <h3>Finish order ${orderLabel(o.id)}</h3>
                        <select id="f-method" aria-label="Payment method" onchange="finishUpdate('${o.id}')">
                            ${METHODS.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}
                        </select>
                    </div>
                    <div class="fin-row"><label for="f-total">Total:</label><input id="f-total" readonly value="${RM(o.total)}"></div>
                    <div class="fin-row"><label for="f-received">Received:</label><input id="f-received" type="number" min="0" step="0.01" inputmode="decimal" oninput="finishUpdate('${o.id}')"></div>
                    <div class="fin-row"><label for="f-change">Change:</label><input id="f-change" readonly value="${RM(0)}"></div>
                    <div class="modal-actions">
                        <button type="button" id="f-confirm" onclick="confirmPayment('${o.id}')" disabled>Confirm Payment</button>
                        <button type="button" onclick="closeModal()">Back</button>
                    </div>
                </div>`);
            $("#f-received").focus();
        }

        function finishUpdate(id) {
            const o = findOrder(id);
            if (!o) return;
            const method = $("#f-method").value;
            const recv = $("#f-received");

            if (method !== "Cash") {
                recv.value = o.total.toFixed(2);
                recv.readOnly = true;
            } else {
                recv.readOnly = false;
            }

            const received = parseFloat(recv.value) || 0;
            const change = received - o.total;
            $("#f-change").value = change >= 0 ? RM(change) : "Not enough";
            $("#f-confirm").disabled = received + 1e-9 < o.total;
        }

        function confirmPayment(id) {
            const o = findOrder(id);
            if (!o) return;
            const method = $("#f-method").value;
            const received = parseFloat($("#f-received").value) || 0;
            if (received + 1e-9 < o.total) { toast("Received amount is less than the total."); return; }

            db.paid.push(Object.assign(clone(o), {
                method,
                received,
                change: Math.round((received - o.total) * 100) / 100,
                paidAt: Date.now()
            }));
            db.orders = db.orders.filter(x => x.id !== id);
            selQueue = null;
            save();
            closeModal();
            renderQueue();
            toast(`Order ${orderLabel(id)} paid.`);
        }

        /* =========================================================
           PAID PAGE
           ========================================================= */
        let selPaid = null;

        function renderPaid() {
            const f = $("#paid-date").value;
            const list = db.paid.filter(o => !f || o.date === f).sort(byDateTime);
            if (!list.some(o => o.id === selPaid)) selPaid = null;

            $("#paid-list").innerHTML = list.length
                ? list.map(o => `
                    <tr class="sel-row ${o.id === selPaid ? "selected" : ""}" onclick="selectPaid('${o.id}')">
                        <td class="left">${orderLabel(o.id)}</td>
                        <td class="left">${o.table}</td>
                        <td>${RM(o.total)}</td>
                        <td>${fmtTime(o.time)}${f ? "" : `<small>${fmtDate(o.date)}</small>`}</td>
                        <td>${esc(o.method)}</td>
                    </tr>`).join("")
                : `<tr class="empty"><td colspan="5">${db.paid.length ? "No paid orders on this date." : "No paid orders yet."}</td></tr>`;
        }

        function selectPaid(id) {
            selPaid = selPaid === id ? null : id;
            renderPaid();
        }

        $("#paid-date").addEventListener("change", renderPaid);
        $("#paid-all").addEventListener("click", () => { $("#paid-date").value = ""; renderPaid(); });

        function paidAction() {
            const o = selPaid && findPaid(selPaid);
            if (!o) { toast("Select an order first."); return; }
            viewOrder(o, true);
        }

        /* =========================================================
           SETTINGS PAGE
           ========================================================= */
        function renderSettings() {
            const panel = $("#settings-panel");
            let head = "", rows = "", form = "";

            if (setTab === "menu") {
                const items = db.menu[setCat];
                head = `<div class="combo">
                            <select aria-label="Menu category" onchange="setCat=this.value;renderSettings()">
                                ${CATEGORIES.map(c => `<option value="${c.key}" ${c.key === setCat ? "selected" : ""}>${c.label}</option>`).join("")}
                            </select>
                        </div>`;
                rows = items.length
                    ? items.map((it, i) => `
                        <div class="set-row">
                            <span class="set-name">${pad(i + 1)}&nbsp;&nbsp;${esc(it.name)}</span>
                            <span class="set-price">${RM(it.price)}</span>
                            <button type="button" class="btn-yellow" onclick="removeSetting(${i})">Remove</button>
                        </div>`).join("")
                    : `<div class="set-empty">No items in this category yet.</div>`;
                form = `<label for="s-name">Name</label>
                        <div class="grow"><input class="dark-input" id="s-name" required maxlength="60" autocomplete="off"></div>
                        <label for="s-price">Price</label>
                        <div style="width:150px"><input class="dark-input" id="s-price" type="number" min="0" step="0.01" inputmode="decimal" required></div>
                        <button type="submit" class="btn-add">Add</button>`;
            }

            if (setTab === "employee") {
                head = `<div class="combo-static">Employee (${db.employees.length})</div>`;
                rows = db.employees.length
                    ? db.employees.map((n, i) => `
                        <div class="set-row">
                            <span class="set-name">${esc(n)}</span>
                            <button type="button" class="btn-yellow" onclick="removeSetting(${i})">Remove</button>
                        </div>`).join("")
                    : `<div class="set-empty">No employees yet.</div>`;
                form = `<label for="s-name">Name</label>
                        <div class="grow"><input class="dark-input" id="s-name" required maxlength="40" autocomplete="off"></div>
                        <button type="submit" class="btn-add">Add</button>`;
            }

            if (setTab === "table") {
                head = `<div class="combo-static">Table (${db.tables.length})</div>`;
                rows = db.tables.length
                    ? db.tables.map((n, i) => `
                        <div class="set-row">
                            <span class="set-name">Table ${n}</span>
                            <button type="button" class="btn-yellow" onclick="removeSetting(${i})">Remove</button>
                        </div>`).join("")
                    : `<div class="set-empty">No tables yet.</div>`;
                form = `<div class="grow"></div>
                        <div class="count-pill">
                            <label for="s-count">Count</label>
                            <input id="s-count" type="number" min="1" max="50" value="1">
                        </div>
                        <button type="submit" class="btn-add">Add</button>`;
            }

            panel.innerHTML = `${head}${rows}<form class="add-form" onsubmit="addSetting(event)">${form}</form>`;
        }

        function addSetting(e) {
            e.preventDefault();

            if (setTab === "menu") {
                const name = $("#s-name").value.trim();
                const price = parseFloat($("#s-price").value);
                if (!name || isNaN(price) || price < 0) { toast("Enter a name and a valid price."); return; }
                db.menu[setCat].push(mk(name, Math.round(price * 100) / 100));
            }

            if (setTab === "employee") {
                const name = $("#s-name").value.trim();
                if (!name) return;
                if (db.employees.some(n => n.toLowerCase() === name.toLowerCase())) { toast(`${name} is already on the list.`); return; }
                db.employees.push(name);
            }

            if (setTab === "table") {
                const count = Math.min(50, Math.max(1, parseInt($("#s-count").value, 10) || 1));
                let next = db.tables.length ? Math.max(...db.tables) + 1 : 1;
                for (let i = 0; i < count; i++) db.tables.push(next++);
                toast(`Added ${count} table${count === 1 ? "" : "s"}.`);
            }

            save();
            renderSettings();
        }

        function removeSetting(index) {
            if (setTab === "menu") db.menu[setCat].splice(index, 1);
            if (setTab === "employee") db.employees.splice(index, 1);
            if (setTab === "table") db.tables.splice(index, 1);
            save();
            renderSettings();
            toast("Removed.");
        }

        /* =========================================================
           REVENUE PAGE
           ========================================================= */
        function periodRange(p) {
            const today = new Date();
            if (p === "today") return { from: dateStr(today), to: dateStr(today) };
            if (p === "week") return { from: dateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), to: dateStr(today) };
            if (p === "month") return { from: dateStr(new Date(today.getFullYear(), today.getMonth(), 1)), to: dateStr(today) };
            return null;
        }

        function chartDays(p) {
            const today = new Date();
            let count = 7;
            if (p === "month") count = today.getDate();
            if (p === "all") count = 30;
            const days = [];
            for (let i = count - 1; i >= 0; i--) {
                days.push(dateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
            }
            return days;
        }

        function renderRevenue() {
            const p = $("#rev-period").value;
            const range = periodRange(p);
            const list = range ? db.paid.filter(o => o.date >= range.from && o.date <= range.to) : db.paid;

            const total = list.reduce((s, o) => s + o.total, 0);
            $("#rev-total").textContent = RM(total);
            $("#rev-count").textContent = list.length;
            $("#rev-avg").textContent = RM(list.length ? total / list.length : 0);

            // best sellers
            const sold = {};
            list.forEach(o => o.items.forEach(l => { sold[l.name] = (sold[l.name] || 0) + l.qty; }));
            const best = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5);
            const top = best.length ? best[0][1] : 1;
            $("#rev-best").innerHTML = best.length
                ? best.map(([name, qty]) => `
                    <div class="best-row">
                        <span>${esc(name)}</span>
                        <div class="best-bar"><span style="width:${(qty / top) * 100}%"></span></div>
                        <span>${qty} sold</span>
                    </div>`).join("")
                : `<div class="set-empty">No sales in this period yet.</div>`;

            // revenue by day
            const days = chartDays(p);
            const perDay = days.map(d => db.paid.filter(o => o.date === d).reduce((s, o) => s + o.total, 0));
            const max = Math.max(...perDay, 1);
            $("#rev-chart").innerHTML = days.map((d, i) => {
                const [, m, day] = d.split("-");
                return `<div class="bar-col">
                            <div class="bar-val">${perDay[i] ? RM(perDay[i]) : ""}</div>
                            <div class="bar" style="height:${(perDay[i] / max) * 78}%"></div>
                            <div class="bar-lbl">${Number(day)}/${Number(m)}</div>
                        </div>`;
            }).join("");
        }

        $("#rev-period").addEventListener("change", renderRevenue);

        /* =========================================================
           Start
           ========================================================= */
        window.addEventListener("storage", () => { db = load(); route(); });

        setFormDefaults();
        populateSelects();
        displayMenu();
        displayOrder();
        route();