import { Locale, Role, TxType } from "@prisma/client";
import { enUS, ru } from "date-fns/locale";

/**
 * Every string the bot can say, in every language it speaks.
 *
 * `en` is the reference dictionary: its keys define the `TranslationKey`
 * union, so adding a string here without translating it is a type error
 * rather than a message that silently falls back to English in production.
 */
const en = {
  // ---------- Buttons ----------
  "btn.cashIncome": "📥 Cash Income",
  "btn.cashExpense": "📤 Cash Expense",
  "btn.bankIncome": "🏦 Bank Income",
  "btn.bankExpense": "🏦 Bank Expense",
  "btn.addCredit": "💳 Add Credit",
  "btn.credits": "📋 Credits",
  "btn.myEntries": "📝 My Entries",
  "btn.balance": "📊 Balance",
  "btn.exportExcel": "📁 Export Excel",
  "btn.logs": "🧾 Logs",
  "btn.users": "👥 Users",
  "btn.language": "🌐 Language",
  "btn.cancel": "❌ Cancel",
  "btn.skip": "⏭ Skip",
  "btn.changeStore": "🏬 Change Store",
  "btn.companies": "🏢 Stores",
  "btn.access": "🔑 Store access",
  "btn.regular": "🔁 Regular Payments",

  // ---------- Roles ----------
  "role.ADMIN": "Admin",
  "role.ACCOUNTANT": "Accountant",
  "role.CASHIER": "Cashier",
  "role.ADMIN.badge": "👑 Admin",
  "role.ACCOUNTANT.badge": "📚 Accountant",
  "role.CASHIER.badge": "💵 Cashier",

  // ---------- Common ----------
  "common.cash": "Cash",
  "common.bank": "Bank",
  "common.income": "Income",
  "common.expense": "Expense",
  "common.cancelled": "Cancelled.",
  "common.next": "Choose the next action:",
  "common.menu": "Menu:",
  "common.chooseFromMenu": "Please choose an action from the menu.",
  "common.stepExpired": "This step is no longer active.",
  "common.buttonExpired": "This button is no longer active.",
  "common.error": "⚠️ Something went wrong. Please try again or press /start.",
  "common.noAccess": "⛔️ You do not have access to this section.",
  "common.skipped": "Skipped",
  "common.badAmount": "⚠️ I could not read that amount. Try again, e.g. {example}",
  "common.addComment": "Add a comment:",
  "common.saved": "✅ <b>Saved</b>",

  // ---------- Auth ----------
  "auth.denied":
    "⛔️ Access denied.\n\nYour Telegram ID is <code>{id}</code>.\nSend it to the administrator to get registered.",
  "auth.yourId": "Your Telegram ID: <code>{id}</code>",

  // ---------- Start ----------
  "start.greeting":
    "👋 Hello, <b>{name}</b>!\n\nYour role: <b>{role}</b>\nAvailable sections: {sections}\n\nChoose an action from the menu below.",
  "start.section.cash": "💵 Cash",
  "start.section.bank": "🏦 Bank",
  "start.section.credits": "💳 Credits",
  "start.section.admin": "🧾 Logs and users",

  // ---------- Language ----------
  "lang.choose": "🌐 Choose the interface language:",
  "lang.changed": "✅ Language set to English.",

  // ---------- Cash ----------
  "cash.title.INCOME": "💵 <b>Cash income</b>",
  "cash.title.EXPENSE": "💵 <b>Cash expense</b>",
  "cash.askAmount": "Enter the amount.\n<i>Examples: 1 500 000 · 250000 · 300 USD</i>",
  "cash.askCategory": "Amount: <b>{amount}</b>\n\nChoose a category:",
  "cash.unknownCategory": "Unknown category.",
  "cash.categoryChosen": "Category: <b>{category}</b>\n\nAdd a comment:",

  // ---------- Bank ----------
  "bank.title.INCOME": "🏦 <b>Bank income</b>",
  "bank.title.EXPENSE": "🏦 <b>Bank expense</b>",
  "bank.askAmount": "Enter the amount.\n<i>Examples: 12 000 000 · 4500.50 · 300 USD</i>",
  "bank.askDate": "Amount: <b>{amount}</b>\n\nChoose the transaction date:",
  "bank.today": "📅 Today",
  "bank.yesterday": "📅 Yesterday",
  "bank.manualDate": "✏️ Enter a date",
  "bank.askManualDate": "Enter the date as <b>dd.mm.yyyy</b> (e.g. 05.03.2026):",
  "bank.badDate": "⚠️ Invalid date. Use the format dd.mm.yyyy, e.g. 05.03.2026",
  "bank.askName": "Date: <b>{date}</b>\n\nEnter the bank name:",
  "bank.askParty": "Enter the counterparty (who paid / who was paid):",

  // ---------- Companies (multi-tenancy) ----------
  "company.choose": "🏢 Which company is this for?",
  "company.chosen": "Company: <b>{name}</b>",
  "company.notFound": "Company not found.",
  "company.needOne":
    "⚠️ No companies have been created yet.\n\nAsk an administrator to add one before recording entries.",
  "company.title": "🏢 <b>Companies</b>",
  "company.listEmpty": "No companies have been added yet.",
  "company.btnAdd": "➕ Add company",
  "company.askName": "Enter the company name:",
  "company.added": "✅ Company <b>{name}</b> added.",
  "company.exists": "⚠️ A company with that name already exists.",
  "company.badName": "⚠️ The name must be between 2 and 60 characters.",

  // ---------- Regular payments ----------
  "reg.title": "🔁 <b>Regular payments</b>",
  "reg.intro": "These are posted automatically as expenses on their day of each month.",
  "reg.none": "No regular payments have been set up yet.",
  "reg.btnAdd": "➕ Add regular payment",
  "reg.askName": "Enter a name for the payment.\n<i>For example: Office rent</i>",
  "reg.askAmount": "Enter the amount charged each month:",
  "reg.askDay":
    "Amount: <b>{amount}</b>\n\nWhich day of the month is it charged? Enter 1–31.\n<i>In shorter months it is posted on the last day.</i>",
  "reg.badDay": "⚠️ Enter a whole number between 1 and 31.",
  "reg.askSource": "Which account does it come out of?",
  "reg.created":
    "✅ <b>Regular payment created</b>\n\n{name}\nCompany: {company}\nAmount: {amount}\nCharged on day {day} of each month\nAccount: {source}",
  "reg.item": "{name} · {amount} · day {day}",
  "reg.card":
    "🔁 <b>{name}</b>\n\nCompany: {company}\nAmount: {amount}\nCharged on day {day} of each month\nAccount: {source}",
  "reg.notFound": "Regular payment not found.",
  "reg.confirmDelete": "Stop this regular payment? Past postings are kept.",
  "reg.deleteYes": "🗑 Yes, stop it",
  "reg.deleted": "🗑 Regular payment stopped.",

  // ---------- Active store ----------
  "store.choose": "🏬 <b>Choose the store you are working in:</b>",
  "store.active":
    "✅ You are now managing: <b>{name}</b>.\nAll your entries will be saved to this store.",
  "store.current": "🏬 Current store: <b>{name}</b>",
  "store.unchanged": "You are already managing {name}.",
  "store.none":
    "⚠️ You are not assigned to any store yet.\n\nAsk an administrator to give you access before recording anything.",
  "store.notSelected":
    "⚠️ <b>No store selected.</b>\n\nPress 🏬 Change Store and pick the one you are working in — entries cannot be saved until you do.",
  "store.noAccess": "⛔️ You do not have access to that store.",
  "store.notFound": "Store not found.",
  "store.revoked":
    "🏬 Your access to that store was withdrawn, so it is no longer selected.",

  // ---------- Store access (admin) ----------
  "sacc.title": "🔑 <b>Store access</b>\n\nChoose a user:",
  "sacc.noUsers": "There are no active users yet.",
  "sacc.noStores": "No stores have been created yet.",
  "sacc.user":
    "🔑 <b>{name}</b> — {role}\n\nTap a store to grant or revoke access. ✅ means they have it.",
  "sacc.granted": "✅ Access granted: {store}",
  "sacc.revoked": "🚫 Access revoked: {store}",
  "sacc.adminAll": "Admins can reach every store, so there is nothing to assign here.",
  "sacc.notifyGranted": "🏬 You now have access to the store <b>{store}</b>.",
  "sacc.notifyRevoked": "🏬 Your access to the store <b>{store}</b> has been withdrawn.",

  // ---------- Credit ----------
  "credit.new": "💳 <b>New credit</b>\n\nEnter the bank name:",
  "credit.askMonthly": "Enter the <b>monthly instalment</b> amount:",
  "credit.askDuration":
    "Monthly instalment: <b>{amount}</b>\n\nOver how many months? Enter 1–360:",
  "credit.badDuration": "⚠️ Enter a whole number of months between 1 and 360.",
  "credit.created":
    "✅ <b>Credit created</b>\n\nBank: {bank}\nTotal: {total}\nDuration: {months} months\nMonthly payment: {monthly}\nFirst payment due: {due}",
  "credit.openSchedule": "📋 Open schedule",
  "credit.none": "No credits have been added yet.",
  "credit.list": "📋 <b>Credits</b>\n\nChoose one to open its schedule:",
  "credit.notFound": "Credit not found.",
  "credit.cardTotal": "Total: {total}",
  "credit.cardDuration": "Duration: {months} months",
  "credit.cardMonthly": "Monthly instalment: {monthly}",
  "credit.cardPaid": "Paid: {paid} ({count}/{total})",
  "credit.cardRemaining": "Remaining: {remaining}",
  "credit.cardStatus": "Status: {status}",
  "credit.statusClosed": "✅ Closed",
  "credit.statusActive": "🔄 Active",
  "credit.tapInstalment": "Tap an instalment to mark it as paid:",
  "credit.allPaid": "All instalments have been paid.",
  "credit.moreInstalments": "… {count} more instalments",
  "credit.payEarlierFirst": "Pay the earlier instalments first.",
  "credit.instalmentNotFound": "Instalment not found.",
  "credit.alreadyPaid": "Already marked as paid.",
  "credit.markedPaid": "✅ Marked as paid",
  "credit.askSource": "Which account is this credit repaid from?",
  "credit.expensePosted":
    "✅ <b>Instalment paid</b>\n\n{bank} · {amount}\nAn expense of {amount} was posted to {source} for {company}.",

  // ---------- Entries ----------
  "entry.notFound": "Entry not found.",
  "entry.onlyOwn": "You can only edit your own entries.",
  "entry.windowClosed":
    "The {minutes}-minute editing window has closed. Ask an administrator.",
  "entry.none": "You have not added any entries yet.",
  "entry.list": "📝 <b>Your last {count} entries</b>\n\nTap one to view or correct it:",
  "entry.askAmount": "Current amount: <b>{amount}</b>\n\nEnter the new amount:",
  "entry.amountUpdated": "✅ Amount updated.",
  "entry.askComment": "Enter the new comment:",
  "entry.commentUpdated": "✅ Comment updated.",
  "entry.confirmDelete": "Delete this entry?",
  "entry.deleteYes": "🗑 Yes, delete",
  "entry.deleteNo": "↩️ Cancel",
  "entry.deleted": "🗑 Deleted",
  "entry.deletedFull": "🗑 Entry deleted.",
  "entry.autoLocked":
    "This entry was posted automatically by the system and cannot be changed here.\nUndo it at its source instead — the credit instalment or the regular payment.",
  "entry.btnAmount": "✏️ Amount",
  "entry.btnComment": "📝 Comment",
  "entry.btnDelete": "🗑 Delete",

  // ---------- Transaction card ----------
  "tx.source": "Source: {source}",
  "tx.type": "Type: {type}",
  "tx.date": "Date: {date}",
  "tx.category": "Category: {category}",
  "tx.bank": "Bank: {bank}",
  "tx.counterparty": "Counterparty: {counterparty}",
  "tx.comment": "Comment: {comment}",

  // ---------- Balance ----------
  "balance.title": "📊 <b>Balance</b>",
  "balance.empty": "📊 There is no data yet.",
  "balance.cash": "💵 Cash balance: {value}",
  "balance.bank": "🏦 Bank balance: {value}",
  "balance.credits": "💳 Credits pending: {value}",
  "balance.income": "📈 Income: {value}",
  "balance.expense": "📉 Expense: {value}",
  "balance.margin": "🎯 Net margin: {value}",

  // ---------- Export ----------
  "export.title": "📁 <b>Excel export</b>\n\nChoose a month:",
  "export.building": "Building the report…",
  "export.caption": "📁 Report for {month}",

  // ---------- Admin ----------
  "admin.logEmpty": "The action log is empty.",
  "admin.logTitle": "🧾 <b>Last {count} actions</b>",
  "admin.system": "system",
  "admin.usersTitle": "👥 <b>Users ({count})</b>",
  "admin.usersHelp":
    "Add or change a user:\n<code>/adduser &lt;telegram_id&gt; &lt;cashier|accountant|admin&gt; &lt;name&gt;</code>\nRemove a user:\n<code>/deluser &lt;telegram_id&gt;</code>",
  "admin.addUserUsage": "Usage:\n<code>/adduser 123456789 cashier Aziz Karimov</code>",
  "admin.idMustBeNumber": "⚠️ The Telegram ID must be a number.",
  "admin.badRole": "⚠️ Role must be one of: cashier, accountant, admin.",
  "admin.userSaved": "✅ Saved.",
  "admin.delUserUsage": "Usage:\n<code>/deluser 123456789</code>",
  "admin.cannotRemoveSelf": "⚠️ You cannot remove your own account.",
  "admin.noSuchUser": "⚠️ No user with that ID.",
  "admin.hasHistory":
    "⚠️ <b>{name}</b> has {transactions} entries and {credits} credits, so the record cannot be deleted.\n\nRemove their access instead?",
  "admin.revokeButton": "🚫 Revoke access",
  "admin.userRemoved": "🗑 <b>{name}</b> has been removed.",
  "admin.userNotFound": "User not found.",
  "admin.accessRevoked": "Access revoked",
  "admin.accessRevokedFull": "🚫 Access revoked for <b>{name}</b>.",

  // ---------- Access requests ----------
  "access.requestSent":
    "👋 Hello, <b>{name}</b>!\n\nYour access request has been sent to the administrator.\nYour Telegram ID: <code>{id}</code>\n\nYou will get a message here once it is reviewed.",
  "access.pending":
    "⏳ Your request is still waiting for the administrator.\nYour Telegram ID: <code>{id}</code>",
  "access.rejected":
    "⛔️ The administrator declined your access request.\nYour Telegram ID: <code>{id}</code>",
  "access.granted":
    "✅ <b>Access granted!</b>\n\nYour role: <b>{role}</b>\nPress /start to begin.",
  "access.revokedNotice": "⛔️ Your access has been withdrawn by the administrator.",

  "req.newRequest":
    "🔔 <b>New access request</b>\n\n<b>{name}</b>\n<code>{id}</code>{username}\n\nWhat should this person be allowed to do?",
  "req.asCashier": "✅ Cashier",
  "req.asAccountant": "✅ Accountant",
  "req.reject": "🚫 Decline",
  "req.approved": "✅ <b>{name}</b> — access granted as {role}.",
  "req.rejectedDone": "🚫 <b>{name}</b> — request declined.",
  "req.alreadyHandled": "This request has already been handled.",
  "req.title": "⏳ <b>Pending requests ({count})</b>",
  "req.empty": "⏳ There are no pending requests.",
  "btn.requests": "⏳ Requests",

  // ---------- Excel export ----------
  "xls.sheetTransactions": "Transactions",
  "xls.sheetPayments": "Credit payments",
  "xls.sheetSummary": "Summary",
  "xls.date": "Date",
  "xls.source": "Source",
  "xls.type": "Type",
  "xls.amount": "Amount",
  "xls.currency": "Currency",
  "xls.category": "Category",
  "xls.bank": "Bank",
  "xls.counterparty": "Counterparty",
  "xls.comment": "Comment",
  "xls.company": "Company",
  "xls.addedBy": "Added by",
  "xls.system": "System",
  "xls.role": "Role",
  "xls.dueDate": "Due date",
  "xls.status": "Status",
  "xls.paidOn": "Paid on",
  "xls.paid": "Paid",
  "xls.pending": "Pending",
  "xls.cashIncome": "Cash income",
  "xls.cashExpense": "Cash expense",
  "xls.bankIncome": "Bank income",
  "xls.bankExpense": "Bank expense",
  "xls.creditsPaid": "Credits paid",
  "xls.netMargin": "Net margin",

  // ---------- Categories (display only; the DB keeps the English name) ----------
  "cat.Sales": "Sales",
  "cat.Advance": "Advance",
  "cat.Debt repayment": "Debt repayment",
  "cat.Investment": "Investment",
  "cat.Supplies": "Supplies",
  "cat.Salary": "Salary",
  "cat.Rent": "Rent",
  "cat.Utilities": "Utilities",
  "cat.Transport": "Transport",
  "cat.Taxes": "Taxes",
  "cat.Other": "Other",
  // Written by automatic postings rather than chosen by a user.
  "cat.Credit payment": "Credit payment",
  "cat.Regular payment": "Regular payment",
  // Synthetic buckets produced by the expense breakdown, not real categories.
  "cat.Bank transfers": "Bank transfers",
  "cat.Uncategorised": "Uncategorised",
} as const;

export type TranslationKey = keyof typeof en;

const ru_: Record<TranslationKey, string> = {
  // ---------- Buttons ----------
  "btn.cashIncome": "📥 Приход (касса)",
  "btn.cashExpense": "📤 Расход (касса)",
  "btn.bankIncome": "🏦 Приход (банк)",
  "btn.bankExpense": "🏦 Расход (банк)",
  "btn.addCredit": "💳 Добавить кредит",
  "btn.credits": "📋 Кредиты",
  "btn.myEntries": "📝 Мои записи",
  "btn.balance": "📊 Баланс",
  "btn.exportExcel": "📁 Экспорт в Excel",
  "btn.logs": "🧾 Журнал",
  "btn.users": "👥 Пользователи",
  "btn.language": "🌐 Язык",
  "btn.cancel": "❌ Отмена",
  "btn.skip": "⏭ Пропустить",
  "btn.changeStore": "🏬 Сменить магазин",
  "btn.companies": "🏢 Магазины",
  "btn.access": "🔑 Доступ к магазинам",
  "btn.regular": "🔁 Регулярные платежи",

  // ---------- Roles ----------
  "role.ADMIN": "Администратор",
  "role.ACCOUNTANT": "Бухгалтер",
  "role.CASHIER": "Кассир",
  "role.ADMIN.badge": "👑 Администратор",
  "role.ACCOUNTANT.badge": "📚 Бухгалтер",
  "role.CASHIER.badge": "💵 Кассир",

  // ---------- Common ----------
  "common.cash": "Касса",
  "common.bank": "Банк",
  "common.income": "Приход",
  "common.expense": "Расход",
  "common.cancelled": "Отменено.",
  "common.next": "Выберите следующее действие:",
  "common.menu": "Меню:",
  "common.chooseFromMenu": "Пожалуйста, выберите действие из меню.",
  "common.stepExpired": "Этот шаг уже неактивен.",
  "common.buttonExpired": "Эта кнопка уже неактивна.",
  "common.error": "⚠️ Что-то пошло не так. Попробуйте ещё раз или нажмите /start.",
  "common.noAccess": "⛔️ У вас нет доступа к этому разделу.",
  "common.skipped": "Пропущено",
  "common.badAmount": "⚠️ Не удалось распознать сумму. Попробуйте ещё раз, например {example}",
  "common.addComment": "Добавьте комментарий:",
  "common.saved": "✅ <b>Сохранено</b>",

  // ---------- Auth ----------
  "auth.denied":
    "⛔️ Доступ запрещён.\n\nВаш Telegram ID: <code>{id}</code>.\nОтправьте его администратору, чтобы вас зарегистрировали.",
  "auth.yourId": "Ваш Telegram ID: <code>{id}</code>",

  // ---------- Start ----------
  "start.greeting":
    "👋 Здравствуйте, <b>{name}</b>!\n\nВаша роль: <b>{role}</b>\nДоступные разделы: {sections}\n\nВыберите действие в меню ниже.",
  "start.section.cash": "💵 Касса",
  "start.section.bank": "🏦 Банк",
  "start.section.credits": "💳 Кредиты",
  "start.section.admin": "🧾 Журнал и пользователи",

  // ---------- Language ----------
  "lang.choose": "🌐 Выберите язык интерфейса:",
  "lang.changed": "✅ Язык переключён на русский.",

  // ---------- Cash ----------
  "cash.title.INCOME": "💵 <b>Приход по кассе</b>",
  "cash.title.EXPENSE": "💵 <b>Расход по кассе</b>",
  "cash.askAmount": "Введите сумму.\n<i>Примеры: 1 500 000 · 250000 · 300 USD</i>",
  "cash.askCategory": "Сумма: <b>{amount}</b>\n\nВыберите категорию:",
  "cash.unknownCategory": "Неизвестная категория.",
  "cash.categoryChosen": "Категория: <b>{category}</b>\n\nДобавьте комментарий:",

  // ---------- Bank ----------
  "bank.title.INCOME": "🏦 <b>Приход по банку</b>",
  "bank.title.EXPENSE": "🏦 <b>Расход по банку</b>",
  "bank.askAmount": "Введите сумму.\n<i>Примеры: 12 000 000 · 4500.50 · 300 USD</i>",
  "bank.askDate": "Сумма: <b>{amount}</b>\n\nВыберите дату операции:",
  "bank.today": "📅 Сегодня",
  "bank.yesterday": "📅 Вчера",
  "bank.manualDate": "✏️ Ввести дату",
  "bank.askManualDate": "Введите дату в формате <b>дд.мм.гггг</b> (например, 05.03.2026):",
  "bank.badDate": "⚠️ Неверная дата. Используйте формат дд.мм.гггг, например 05.03.2026",
  "bank.askName": "Дата: <b>{date}</b>\n\nВведите название банка:",
  "bank.askParty": "Введите контрагента (кто заплатил / кому заплатили):",

  // ---------- Компании ----------
  "company.choose": "🏢 К какой компании относится запись?",
  "company.chosen": "Компания: <b>{name}</b>",
  "company.notFound": "Компания не найдена.",
  "company.needOne":
    "⚠️ Компании ещё не созданы.\n\nПопросите администратора добавить компанию перед вводом записей.",
  "company.title": "🏢 <b>Компании</b>",
  "company.listEmpty": "Компании ещё не добавлены.",
  "company.btnAdd": "➕ Добавить компанию",
  "company.askName": "Введите название компании:",
  "company.added": "✅ Компания <b>{name}</b> добавлена.",
  "company.exists": "⚠️ Компания с таким названием уже есть.",
  "company.badName": "⚠️ Название должно быть от 2 до 60 символов.",

  // ---------- Регулярные платежи ----------
  "reg.title": "🔁 <b>Регулярные платежи</b>",
  "reg.intro": "Они автоматически проводятся как расход в свой день каждого месяца.",
  "reg.none": "Регулярные платежи ещё не настроены.",
  "reg.btnAdd": "➕ Добавить платёж",
  "reg.askName": "Введите название платежа.\n<i>Например: Аренда офиса</i>",
  "reg.askAmount": "Введите сумму, списываемую каждый месяц:",
  "reg.askDay":
    "Сумма: <b>{amount}</b>\n\nВ какой день месяца списывается? Введите 1–31.\n<i>В коротких месяцах проводится в последний день.</i>",
  "reg.badDay": "⚠️ Введите целое число от 1 до 31.",
  "reg.askSource": "С какого счёта списывается?",
  "reg.created":
    "✅ <b>Регулярный платёж создан</b>\n\n{name}\nКомпания: {company}\nСумма: {amount}\nСписание: {day}-го числа каждого месяца\nСчёт: {source}",
  "reg.item": "{name} · {amount} · {day}-го",
  "reg.card":
    "🔁 <b>{name}</b>\n\nКомпания: {company}\nСумма: {amount}\nСписание: {day}-го числа каждого месяца\nСчёт: {source}",
  "reg.notFound": "Регулярный платёж не найден.",
  "reg.confirmDelete": "Остановить этот регулярный платёж? Ранее проведённые записи сохраняются.",
  "reg.deleteYes": "🗑 Да, остановить",
  "reg.deleted": "🗑 Регулярный платёж остановлен.",

  // ---------- Активный магазин ----------
  "store.choose": "🏬 <b>Выберите магазин, в котором работаете:</b>",
  "store.active":
    "✅ Вы работаете с магазином: <b>{name}</b>.\nВсе ваши записи будут сохраняться в него.",
  "store.current": "🏬 Текущий магазин: <b>{name}</b>",
  "store.unchanged": "Вы уже работаете с магазином {name}.",
  "store.none":
    "⚠️ Вам пока не назначен ни один магазин.\n\nПопросите администратора выдать доступ, прежде чем вводить записи.",
  "store.notSelected":
    "⚠️ <b>Магазин не выбран.</b>\n\nНажмите 🏬 Сменить магазин и выберите тот, в котором работаете, — без этого записи не сохраняются.",
  "store.noAccess": "⛔️ У вас нет доступа к этому магазину.",
  "store.notFound": "Магазин не найден.",
  "store.revoked":
    "🏬 Ваш доступ к этому магазину отозван, поэтому он больше не выбран.",

  // ---------- Доступ к магазинам (админ) ----------
  "sacc.title": "🔑 <b>Доступ к магазинам</b>\n\nВыберите пользователя:",
  "sacc.noUsers": "Активных пользователей пока нет.",
  "sacc.noStores": "Магазины ещё не созданы.",
  "sacc.user":
    "🔑 <b>{name}</b> — {role}\n\nНажмите на магазин, чтобы выдать или отозвать доступ. ✅ — доступ есть.",
  "sacc.granted": "✅ Доступ выдан: {store}",
  "sacc.revoked": "🚫 Доступ отозван: {store}",
  "sacc.adminAll": "У администраторов есть доступ ко всем магазинам, назначать нечего.",
  "sacc.notifyGranted": "🏬 Вам открыт доступ к магазину <b>{store}</b>.",
  "sacc.notifyRevoked": "🏬 Ваш доступ к магазину <b>{store}</b> отозван.",

  // ---------- Credit ----------
  "credit.new": "💳 <b>Новый кредит</b>\n\nВведите название банка:",
  "credit.askMonthly": "Введите сумму <b>ежемесячного платежа</b>:",
  "credit.askDuration":
    "Ежемесячный платёж: <b>{amount}</b>\n\nНа сколько месяцев? Введите 1–360:",
  "credit.badDuration": "⚠️ Введите целое число месяцев от 1 до 360.",
  "credit.created":
    "✅ <b>Кредит создан</b>\n\nБанк: {bank}\nСумма: {total}\nСрок: {months} мес.\nЕжемесячный платёж: {monthly}\nПервый платёж: {due}",
  "credit.openSchedule": "📋 Открыть график",
  "credit.none": "Кредиты ещё не добавлены.",
  "credit.list": "📋 <b>Кредиты</b>\n\nВыберите кредит, чтобы открыть график:",
  "credit.notFound": "Кредит не найден.",
  "credit.cardTotal": "Сумма: {total}",
  "credit.cardDuration": "Срок: {months} мес.",
  "credit.cardMonthly": "Ежемесячный платёж: {monthly}",
  "credit.cardPaid": "Оплачено: {paid} ({count}/{total})",
  "credit.cardRemaining": "Остаток: {remaining}",
  "credit.cardStatus": "Статус: {status}",
  "credit.statusClosed": "✅ Закрыт",
  "credit.statusActive": "🔄 Активен",
  "credit.tapInstalment": "Нажмите на платёж, чтобы отметить его оплаченным:",
  "credit.allPaid": "Все платежи оплачены.",
  "credit.moreInstalments": "… ещё {count} платежей",
  "credit.payEarlierFirst": "Сначала оплатите более ранние платежи.",
  "credit.instalmentNotFound": "Платёж не найден.",
  "credit.alreadyPaid": "Уже отмечен как оплаченный.",
  "credit.markedPaid": "✅ Отмечено как оплачено",
  "credit.askSource": "С какого счёта погашается кредит?",
  "credit.expensePosted":
    "✅ <b>Платёж проведён</b>\n\n{bank} · {amount}\nРасход {amount} проведён по счёту «{source}» для «{company}».",

  // ---------- Entries ----------
  "entry.notFound": "Запись не найдена.",
  "entry.onlyOwn": "Вы можете редактировать только свои записи.",
  "entry.windowClosed":
    "{minutes}-минутное окно для правок закрыто. Обратитесь к администратору.",
  "entry.none": "Вы ещё не добавили ни одной записи.",
  "entry.list":
    "📝 <b>Ваши последние записи: {count}</b>\n\nНажмите на запись, чтобы посмотреть или исправить:",
  "entry.askAmount": "Текущая сумма: <b>{amount}</b>\n\nВведите новую сумму:",
  "entry.amountUpdated": "✅ Сумма обновлена.",
  "entry.askComment": "Введите новый комментарий:",
  "entry.commentUpdated": "✅ Комментарий обновлён.",
  "entry.confirmDelete": "Удалить эту запись?",
  "entry.deleteYes": "🗑 Да, удалить",
  "entry.deleteNo": "↩️ Отмена",
  "entry.deleted": "🗑 Удалено",
  "entry.deletedFull": "🗑 Запись удалена.",
  "entry.autoLocked":
    "Эта запись создана системой автоматически и не редактируется здесь.\nОтмените её в источнике — в платеже по кредиту или в регулярном платеже.",
  "entry.btnAmount": "✏️ Сумма",
  "entry.btnComment": "📝 Комментарий",
  "entry.btnDelete": "🗑 Удалить",

  // ---------- Transaction card ----------
  "tx.source": "Источник: {source}",
  "tx.type": "Тип: {type}",
  "tx.date": "Дата: {date}",
  "tx.category": "Категория: {category}",
  "tx.bank": "Банк: {bank}",
  "tx.counterparty": "Контрагент: {counterparty}",
  "tx.comment": "Комментарий: {comment}",

  // ---------- Balance ----------
  "balance.title": "📊 <b>Баланс</b>",
  "balance.empty": "📊 Данных пока нет.",
  "balance.cash": "💵 Остаток по кассе: {value}",
  "balance.bank": "🏦 Остаток по банку: {value}",
  "balance.credits": "💳 Остаток по кредитам: {value}",
  "balance.income": "📈 Приход: {value}",
  "balance.expense": "📉 Расход: {value}",
  "balance.margin": "🎯 Чистая маржа: {value}",

  // ---------- Export ----------
  "export.title": "📁 <b>Экспорт в Excel</b>\n\nВыберите месяц:",
  "export.building": "Формирую отчёт…",
  "export.caption": "📁 Отчёт за {month}",

  // ---------- Admin ----------
  "admin.logEmpty": "Журнал действий пуст.",
  "admin.logTitle": "🧾 <b>Последние действия: {count}</b>",
  "admin.system": "система",
  "admin.usersTitle": "👥 <b>Пользователи ({count})</b>",
  "admin.usersHelp":
    "Добавить или изменить пользователя:\n<code>/adduser &lt;telegram_id&gt; &lt;cashier|accountant|admin&gt; &lt;имя&gt;</code>\nУдалить пользователя:\n<code>/deluser &lt;telegram_id&gt;</code>",
  "admin.addUserUsage":
    "Формат:\n<code>/adduser 123456789 cashier Азиз Каримов</code>",
  "admin.idMustBeNumber": "⚠️ Telegram ID должен быть числом.",
  "admin.badRole": "⚠️ Роль должна быть одной из: cashier, accountant, admin.",
  "admin.userSaved": "✅ Сохранено.",
  "admin.delUserUsage": "Формат:\n<code>/deluser 123456789</code>",
  "admin.cannotRemoveSelf": "⚠️ Вы не можете удалить собственную учётную запись.",
  "admin.noSuchUser": "⚠️ Пользователь с таким ID не найден.",
  "admin.hasHistory":
    "⚠️ У <b>{name}</b> есть записей: {transactions} и кредитов: {credits}, поэтому запись нельзя удалить.\n\nОтозвать доступ вместо удаления?",
  "admin.revokeButton": "🚫 Отозвать доступ",
  "admin.userRemoved": "🗑 <b>{name}</b> удалён.",
  "admin.userNotFound": "Пользователь не найден.",
  "admin.accessRevoked": "Доступ отозван",
  "admin.accessRevokedFull": "🚫 Доступ отозван для <b>{name}</b>.",

  // ---------- Access requests ----------
  "access.requestSent":
    "👋 Здравствуйте, <b>{name}</b>!\n\nВаша заявка на доступ отправлена администратору.\nВаш Telegram ID: <code>{id}</code>\n\nКогда её рассмотрят, вам придёт сообщение сюда.",
  "access.pending":
    "⏳ Ваша заявка ещё на рассмотрении у администратора.\nВаш Telegram ID: <code>{id}</code>",
  "access.rejected":
    "⛔️ Администратор отклонил вашу заявку на доступ.\nВаш Telegram ID: <code>{id}</code>",
  "access.granted":
    "✅ <b>Доступ выдан!</b>\n\nВаша роль: <b>{role}</b>\nНажмите /start, чтобы начать.",
  "access.revokedNotice": "⛔️ Администратор отозвал ваш доступ.",

  "req.newRequest":
    "🔔 <b>Новая заявка на доступ</b>\n\n<b>{name}</b>\n<code>{id}</code>{username}\n\nЧто разрешить этому человеку?",
  "req.asCashier": "✅ Кассир",
  "req.asAccountant": "✅ Бухгалтер",
  "req.reject": "🚫 Отклонить",
  "req.approved": "✅ <b>{name}</b> — доступ выдан как {role}.",
  "req.rejectedDone": "🚫 <b>{name}</b> — заявка отклонена.",
  "req.alreadyHandled": "Эта заявка уже обработана.",
  "req.title": "⏳ <b>Заявки на доступ ({count})</b>",
  "req.empty": "⏳ Заявок на доступ нет.",
  "btn.requests": "⏳ Заявки",

  // ---------- Excel export ----------
  "xls.sheetTransactions": "Операции",
  "xls.sheetPayments": "Платежи по кредитам",
  "xls.sheetSummary": "Итоги",
  "xls.date": "Дата",
  "xls.source": "Источник",
  "xls.type": "Тип",
  "xls.amount": "Сумма",
  "xls.currency": "Валюта",
  "xls.category": "Категория",
  "xls.bank": "Банк",
  "xls.counterparty": "Контрагент",
  "xls.comment": "Комментарий",
  "xls.company": "Компания",
  "xls.addedBy": "Добавил",
  "xls.system": "Система",
  "xls.role": "Роль",
  "xls.dueDate": "Срок платежа",
  "xls.status": "Статус",
  "xls.paidOn": "Дата оплаты",
  "xls.paid": "Оплачен",
  "xls.pending": "Ожидается",
  "xls.cashIncome": "Приход (касса)",
  "xls.cashExpense": "Расход (касса)",
  "xls.bankIncome": "Приход (банк)",
  "xls.bankExpense": "Расход (банк)",
  "xls.creditsPaid": "Оплачено по кредитам",
  "xls.netMargin": "Чистая маржа",

  // ---------- Categories ----------
  "cat.Sales": "Продажи",
  "cat.Advance": "Аванс",
  "cat.Debt repayment": "Возврат долга",
  "cat.Investment": "Инвестиции",
  "cat.Supplies": "Закупки",
  "cat.Salary": "Зарплата",
  "cat.Rent": "Аренда",
  "cat.Utilities": "Коммунальные",
  "cat.Transport": "Транспорт",
  "cat.Taxes": "Налоги",
  "cat.Other": "Прочее",
  "cat.Credit payment": "Платёж по кредиту",
  "cat.Regular payment": "Регулярный платёж",
  "cat.Bank transfers": "Банковские переводы",
  "cat.Uncategorised": "Без категории",
};

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  EN: en,
  RU: ru_,
};

export const LOCALES: Locale[] = [Locale.RU, Locale.EN];

export const LOCALE_LABEL: Record<Locale, string> = {
  RU: "🇷🇺 Русский",
  EN: "🇬🇧 English",
};

/** date-fns locale, so month names in the export picker follow the language. */
export const DATE_LOCALE: Record<Locale, typeof ru> = { RU: ru, EN: enUS };

/**
 * Looks up a string and fills in `{placeholders}`.
 *
 * Interpolation is deliberately dumb: values are substituted verbatim, so
 * anything user-supplied must already be HTML-escaped by the caller.
 */
export function t(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const template = DICTIONARIES[locale][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}

/** A translator bound to one user's language. */
export type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>
) => string;

export function translator(locale: Locale): Translate {
  return (key, params) => t(locale, key, params);
}

// ---------- Cross-language button matching ----------

/**
 * Reply keyboards send back the label as plain text, so a handler has to
 * recognise its button in every language at once — a user who switches
 * language mid-session still has the old keyboard on screen.
 */
export function labels(key: TranslationKey): string[] {
  return [...new Set(LOCALES.map((locale) => DICTIONARIES[locale][key]))];
}

/** Every menu label in every language, used to detect "abandon the wizard". */
export function allMenuLabels(): Set<string> {
  const keys: TranslationKey[] = [
    "btn.cashIncome",
    "btn.cashExpense",
    "btn.bankIncome",
    "btn.bankExpense",
    "btn.addCredit",
    "btn.credits",
    "btn.myEntries",
    "btn.balance",
    "btn.exportExcel",
    "btn.logs",
    "btn.users",
    "btn.requests",
    "btn.changeStore",
    "btn.access",
    "btn.companies",
    "btn.regular",
    "btn.language",
    "btn.cancel",
  ];
  return new Set(keys.flatMap(labels));
}

// ---------- Categories ----------

/**
 * The canonical category names, stored verbatim in the database so that
 * reports group correctly no matter which language created the entry.
 */
export const CASH_CATEGORIES: Record<TxType, string[]> = {
  INCOME: ["Sales", "Advance", "Debt repayment", "Investment", "Other"],
  EXPENSE: [
    "Supplies",
    "Salary",
    "Rent",
    "Utilities",
    "Transport",
    "Taxes",
    "Other",
  ],
};

/** Translates a stored category name for display. */
export function categoryLabel(locale: Locale, canonical: string): string {
  const key = `cat.${canonical}` as TranslationKey;
  return key in en ? t(locale, key) : canonical;
}

export function roleLabel(locale: Locale, role: Role): string {
  return t(locale, `role.${role}` as TranslationKey);
}

export function roleBadge(locale: Locale, role: Role): string {
  return t(locale, `role.${role}.badge` as TranslationKey);
}
