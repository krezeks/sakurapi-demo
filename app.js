(() => {
  'use strict';

  const STORAGE_KEY = 'saku-rapi.transactions.v1';
  const INCOME_CATEGORIES = ['Gaji', 'Bonus', 'Penjualan', 'Hadiah', 'Lainnya'];
  const EXPENSE_CATEGORIES = ['Makan & minum', 'Transportasi', 'Tagihan', 'Belanja', 'Kesehatan', 'Pendidikan', 'Hiburan', 'Lainnya'];
  const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const $ = (selector) => document.querySelector(selector);

  const form = $('#transaction-form');
  const descriptionInput = $('#description');
  const amountInput = $('#amount');
  const dateInput = $('#date');
  const categoryInput = $('#category');
  const monthInput = $('#month-filter');
  const searchInput = $('#search');
  const list = $('#transactions-list');
  const emptyState = $('#empty-state');
  const noResults = $('#no-results');
  const formMessage = $('#form-message');
  const toast = $('#toast');

  let transactions = loadTransactions();
  let activeFilter = 'all';
  let toastTimer;

  function currentMonth() {
    return new Date().toISOString().slice(0, 7);
  }

  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && typeof item.id === 'string' &&
        typeof item.description === 'string' && Number.isSafeInteger(item.amount) && item.amount > 0 &&
        (item.type === 'income' || item.type === 'expense') && typeof item.category === 'string' &&
        typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date));
    } catch {
      return [];
    }
  }

  function saveTransactions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
      return true;
    } catch {
      showToast('Penyimpanan browser penuh atau tidak tersedia. Coba ekspor catatanmu.');
      return false;
    }
  }

  function chosenType() {
    return form.querySelector('input[name="type"]:checked').value;
  }

  function setCategories(type, preferredValue) {
    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    categoryInput.replaceChildren();
    for (const category of categories) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categoryInput.append(option);
    }
    if (preferredValue && categories.includes(preferredValue)) categoryInput.value = preferredValue;
  }

  function visibleTransactions() {
    const month = monthInput.value;
    const query = searchInput.value.trim().toLocaleLowerCase('id-ID');
    return transactions
      .filter((item) => item.date.slice(0, 7) === month)
      .filter((item) => activeFilter === 'all' || item.type === activeFilter)
      .filter((item) => !query || `${item.description} ${item.category}`.toLocaleLowerCase('id-ID').includes(query))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }

  function updateSummary() {
    const monthItems = transactions.filter((item) => item.date.slice(0, 7) === monthInput.value);
    const income = monthItems.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
    const expenses = monthItems.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
    const balance = income - expenses;
    $('#income-total').textContent = currency.format(income);
    $('#expense-total').textContent = currency.format(expenses);
    $('#balance-total').textContent = currency.format(balance);
    $('#balance-note').textContent = balance < 0 ? 'Pengeluaran lebih besar bulan ini' : 'Pemasukan dikurangi pengeluaran';
    $('#balance-total').classList.toggle('negative-value', balance < 0);
  }

  function createTransactionRow(item) {
    const row = document.createElement('li');
    row.className = 'transaction-item';
    row.dataset.type = item.type;

    const symbol = document.createElement('span');
    symbol.className = 'transaction-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = item.type === 'income' ? '↙' : '↗';

    const copy = document.createElement('div');
    copy.className = 'transaction-copy';
    const name = document.createElement('p');
    name.className = 'transaction-name';
    name.textContent = item.description;
    const meta = document.createElement('p');
    meta.className = 'transaction-meta';
    const parsedDate = new Date(`${item.date}T12:00:00`);
    meta.textContent = `${item.category} · ${dateFormat.format(parsedDate)}`;
    copy.append(name, meta);

    const value = document.createElement('span');
    value.className = 'transaction-amount';
    value.textContent = `${item.type === 'income' ? '+' : '−'}${currency.format(item.amount)}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-button';
    remove.dataset.deleteId = item.id;
    remove.setAttribute('aria-label', `Hapus transaksi ${item.description}`);
    remove.title = 'Hapus transaksi';
    remove.textContent = '×';

    row.append(symbol, copy, value, remove);
    return row;
  }

  function render() {
    updateSummary();
    const items = visibleTransactions();
    list.replaceChildren(...items.map(createTransactionRow));
    const monthCount = transactions.filter((item) => item.date.slice(0, 7) === monthInput.value).length;
    $('#result-count').textContent = monthCount ? `${items.length} dari ${monthCount} transaksi` : '';
    emptyState.hidden = monthCount > 0;
    noResults.hidden = monthCount === 0 || items.length > 0;
    list.hidden = items.length === 0;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function escapeCsvCell(value) {
    let text = String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    const rows = transactions
      .filter((item) => item.date.slice(0, 7) === monthInput.value)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => [item.date, item.type === 'income' ? 'Pemasukan' : 'Pengeluaran', item.category, item.description, item.amount]);
    if (!rows.length) {
      showToast('Belum ada transaksi pada bulan yang dipilih.');
      return;
    }
    const csv = ['Tanggal,Jenis,Kategori,Deskripsi,Jumlah (IDR)', ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `saku-rapi-${monthInput.value}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('File CSV berhasil diunduh.');
  }

  form.addEventListener('change', (event) => {
    if (event.target.matches('input[name="type"]')) setCategories(chosenType());
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    formMessage.textContent = '';
    const description = descriptionInput.value.trim();
    const amount = amountInput.valueAsNumber;
    const date = dateInput.value;
    if (!description) {
      formMessage.textContent = 'Isi nama transaksi terlebih dahulu.';
      descriptionInput.focus();
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      formMessage.textContent = 'Masukkan jumlah rupiah berupa angka bulat yang lebih dari nol.';
      amountInput.focus();
      return;
    }
    if (!date || Number.isNaN(Date.parse(`${date}T12:00:00`))) {
      formMessage.textContent = 'Pilih tanggal transaksi yang valid.';
      dateInput.focus();
      return;
    }
    const item = {
      id: (globalThis.crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      description: description.slice(0, 70),
      amount,
      date,
      type: chosenType(),
      category: categoryInput.value
    };
    transactions.push(item);
    saveTransactions();
    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    setCategories('expense');
    monthInput.value = item.date.slice(0, 7);
    render();
    descriptionInput.focus();
    showToast('Transaksi berhasil disimpan di perangkat ini.');
  });

  document.querySelectorAll('.filter-button').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll('.filter-button').forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
      render();
    });
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-id]');
    if (!button) return;
    const item = transactions.find((entry) => entry.id === button.dataset.deleteId);
    if (!item) return;
    if (!window.confirm(`Hapus catatan “${item.description}”?`)) return;
    transactions = transactions.filter((entry) => entry.id !== item.id);
    saveTransactions();
    render();
    showToast('Catatan transaksi dihapus.');
  });

  monthInput.addEventListener('input', render);
  searchInput.addEventListener('input', render);
  $('#export-button').addEventListener('click', exportCsv);

  monthInput.value = currentMonth();
  dateInput.value = new Date().toISOString().slice(0, 10);
  setCategories('expense');
  render();
})();
