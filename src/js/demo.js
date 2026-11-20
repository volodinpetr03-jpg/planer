'use strict';
// Пример заполнения: проекты, задачи, операции за 4 месяца — чтобы графики сразу показывали картину
function demo() {
  const d = blank(); d.demo = true;
  const t = today(), DD = n => addDays(t, n), ago = n => Date.now() - n * 864e5;
  let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, R = (a, b) => Math.round(a + rnd() * (b - a));
  d.tags.push({ id: 'shop', title: 'покупки', color: '#f2b441' }, { id: 'trip', title: 'отпуск', color: '#14b8a6' });
  d.projects = [
    newProject({ id: 'p1', title: 'Ремонт кухни', color: '#f97316', desc: 'Новый гарнитур, плитка и техника. Уложиться в бюджет и закончить до праздников.', start: DD(-40), deadline: DD(35), budget: 180000 }),
    newProject({ id: 'p2', title: 'Квартальный отчёт', color: '#4d8dff', desc: 'Собрать цифры, подготовить выводы и презентацию для руководства.', start: DD(-12), deadline: DD(9) }),
    newProject({ id: 'p3', title: 'Отпуск летом', color: '#14b8a6', desc: 'Выбрать направление, купить билеты, забронировать жильё.', start: DD(-25), deadline: DD(190), budget: 150000 })
  ];
  const T = (title, col, o) => newTask({ title, col, created: ago(R(3, 20)), ...o });
  const done = (n, o) => ({ col: 'done', doneAt: ago(n) - R(1, 8) * 3600e3, ...o });
  d.tasks = [
    T('Подготовить отчёт за квартал', 'doing', { id: 'tk1', project: 'p2', tags: ['work'], prio: 2, date: DD(1), time: '10:00', dur: 120, remind: 30, desc: 'Цифры по продажам, выводы и план на следующий квартал.', checklist: [{ t: 'Собрать данные', d: true }, { t: 'Написать выводы', d: false }, { t: 'Сделать слайды', d: false }] }),
    T('Встреча с руководителем', 'todo', { project: 'p2', tags: ['work'], prio: 1, date: DD(8), time: '15:00', dur: 60, remind: 15 }),
    T('Выгрузить продажи из CRM', 'done', done(2, { project: 'p2', tags: ['work'], date: DD(-2) })),
    T('Согласовать структуру отчёта', 'done', done(5, { project: 'p2', tags: ['work'], date: DD(-5) })),
    T('Выбрать плитку для фартука', 'todo', { id: 'tk2', project: 'p1', tags: ['home', 'shop'], prio: 1, date: DD(2), time: '18:00', dur: 90 }),
    T('Заказать кухонный гарнитур', 'done', done(9, { id: 'tk3', project: 'p1', tags: ['home', 'shop'], date: DD(-9) })),
    T('Демонтаж старой кухни', 'done', done(12, { project: 'p1', tags: ['home'], date: DD(-12) })),
    T('Вызвать электрика: перенос розеток', 'doing', { project: 'p1', tags: ['home'], date: DD(0), time: '12:00', dur: 120, remind: 60 }),
    T('Купить варочную панель', 'todo', { id: 'tk4', project: 'p1', tags: ['home', 'shop'], date: DD(6) }),
    T('Установка гарнитура', 'todo', { project: 'p1', tags: ['home'], prio: 2, date: DD(21), time: '09:00', dur: 480 }),
    T('Выбрать страну и даты', 'done', done(15, { project: 'p3', tags: ['trip', 'family'], date: DD(-15) })),
    T('Купить авиабилеты', 'done', done(10, { id: 'tk5', project: 'p3', tags: ['trip'], date: DD(-10) })),
    T('Забронировать жильё', 'todo', { project: 'p3', tags: ['trip'], date: DD(14) }),
    T('Оформить страховку', 'todo', { project: 'p3', tags: ['trip'] }),
    T('Утренняя зарядка', 'todo', { tags: ['health'], date: DD(0), time: '07:30', dur: 20, repeat: 'day', remind: 0 }),
    T('Купить продукты на неделю', 'todo', { tags: ['shop', 'home'], date: DD(0), time: '19:00', dur: 60, checklist: [{ t: 'Молоко', d: false }, { t: 'Овощи', d: false }, { t: 'Кофе', d: false }] }),
    T('Позвонить родителям', 'todo', { tags: ['family'], date: DD(2), time: '20:00', dur: 30, remind: 0 }),
    T('Записаться к стоматологу', 'todo', { tags: ['health'], prio: 1, date: DD(-1) }),
    T('Тренировка в зале', 'todo', { tags: ['health'], date: DD(1), time: '18:30', dur: 90, repeat: 'week' }),
    T('Еженедельный обзор задач', 'todo', { tags: ['work'], date: DD(3), time: '17:00', dur: 30, repeat: 'week', remind: 15 }),
    T('Прочитать книгу по финансам', 'todo', {}),
    T('Разобрать рабочую почту', 'done', done(1, { tags: ['work'], date: DD(-1) })),
    T('Оплатить штраф ГИБДД', 'done', done(3, { date: DD(-3) })),
    T('Сдать вещи в химчистку', 'done', done(4, { tags: ['home'], date: DD(-4) })),
    T('Купить подарок коллеге', 'done', done(6, { tags: ['shop', 'work'], date: DD(-6) })),
    T('Пробежка 5 км', 'done', done(7, { tags: ['health'], date: DD(-7) })),
    T('Обновить резюме', 'done', done(11, { tags: ['work'], date: DD(-11) }))
  ];
  // вложенные подзадачи
  const sub = (title, parent, o) => d.tasks.push(newTask({ title, parent, col: 'todo', created: ago(R(1, 6)), ...o }));
  sub('Цифры по филиалам', 'tk1', { project: 'p2', tags: ['work'], col: 'done', doneAt: ago(1), date: DD(-1), dur: 60 });
  sub('Написать выводы', 'tk1', { id: 'tk1b', project: 'p2', tags: ['work'], date: DD(0), dur: 90 });
  sub('Сделать слайды', 'tk1', { id: 'tk1c', project: 'p2', tags: ['work'], date: DD(1), dur: 60 });
  sub('Графики продаж по месяцам', 'tk1c', { project: 'p2', tags: ['work'], date: DD(1), dur: 45 });
  sub('Проверить цифры с бухгалтерией', 'tk1b', { project: 'p2', tags: ['work'], dur: 30, date: DD(0) });
  const inst = d.tasks.find(t => t.title === 'Установка гарнитура'); inst.id = 'tk6';
  sub('Освободить кухню', 'tk6', { project: 'p1', tags: ['home'], date: DD(20) });
  sub('Принять работу по акту', 'tk6', { project: 'p1', tags: ['home'], date: DD(21) });
  d.tasks.find(t => t.title === 'Записаться к стоматологу').postponed = 3;
  d.tasks.find(t => t.title === 'Прочитать книгу по финансам').postponed = 2;
  d.tasks.find(t => t.title === 'Выбрать плитку для фартука').postponed = 1;
  // история выполненных задач за 10 недель — для инсайтов (старые — в архиве)
  const pool = [['Разобрать почту', ['work'], 30], ['Отчёт по продажам', ['work'], 90], ['Созвон с командой', ['work'], 30], ['Подготовить презентацию', ['work'], 120], ['Купить продукты', ['home', 'shop'], 60], ['Уборка', ['home'], 90], ['Оплатить счета', ['home'], 15], ['Пробежка', ['health'], 40], ['Тренировка', ['health'], 60], ['Позвонить родителям', ['family'], 30], ['Починить кран', ['home'], 60], ['Прочитать главу книги', [], 30], ['Встреча с клиентом', ['work'], 60], ['Стирка и глажка', ['home'], 60]];
  const wdW = [.4, 1, 1.45, 1.2, 1, .8, .5], hrs = [8, 9, 10, 10, 11, 11, 11, 12, 12, 13, 14, 15, 16, 18, 20, 21];
  for (let i = 0; i < 90; i++) {
    let day; do { day = DD(-R(2, 70)); } while (rnd() > wdW[pd(day).getDay()] / 1.45);
    const [title, tags, dur] = pool[R(0, pool.length - 1)], hh = hrs[R(0, hrs.length - 1)];
    const late = tags.includes('home') ? rnd() < .45 : rnd() < .18, due = late ? addDays(day, -R(1, 4)) : addDays(day, rnd() < .7 ? 0 : R(1, 3));
    const doneAt = pd(day).getTime() + hh * 3600e3 + R(0, 59) * 60e3;
    d.tasks.push(newTask({ title, tags: [...tags], dur, col: 'done', date: due, doneAt, created: doneAt - R(0, 6) * 864e5 - R(1, 10) * 3600e3, archived: diff(day, t) > 12, order: 500 + i }));
  }
  d.folders = [{ id: 'f1', title: 'Дом', color: '#3ecf8e', parent: null }, { id: 'f2', title: 'Работа', color: '#4d8dff', parent: null }, { id: 'f3', title: 'Отчётность', color: '#a26bfa', parent: 'f2' }, { id: 'f4', title: 'Личное', color: '#14b8a6', parent: null }];
  d.projects[0].folder = 'f1'; d.projects[1].folder = 'f3'; d.projects[2].folder = 'f4';
  d.tasks.forEach((x, i) => { if (x.order < 500) x.order = i; });
  const b = d.budget;
  b.accounts[0].initial = 46000; b.accounts[1].initial = 7500; b.accounts[2].initial = 120000;
  const lim = { e0: 26000, e1: 7000, e2: 5000, e5: 4000, e7: 6000, e6: 5000 };
  b.categories.forEach(c => { if (lim[c.id]) c.limit = lim[c.id]; });
  const tx = (date, type, amount, category, o) => b.tx.push(newTx({ date, type, amount, category, account: 'card', created: pd(date).getTime() + R(1, 80000) * 1000, ...o }));
  const start = mAdd(mkey(t), -3) + '-01';
  for (let s = start; s <= t; s = addDays(s, 1)) {
    const day = pd(s).getDate(), r = rnd();
    if (day === 5) tx(s, 'income', 58000, 'i0', { note: 'Зарплата' });
    if (day === 20) tx(s, 'income', 41000, 'i0', { note: 'Аванс' });
    if (day === 12 && rnd() > .3) tx(s, 'income', R(6, 15) * 1000, 'i1', { note: 'Подработка' });
    if (day === 6) tx(s, 'transfer', 10000, null, { to: 'save', note: 'В копилку' });
    if (day === 10) tx(s, 'expense', 6850, 'e3', { note: 'Квартплата', regular: 'r1' });
    if (day === 15) tx(s, 'expense', 650, 'e4', { note: 'Интернет', regular: 'r2' });
    if (day === 25) tx(s, 'expense', 450, 'e4', { note: 'Мобильная связь', regular: 'r3' });
    if (day === 3) tx(s, 'expense', 199, 'e7', { note: 'Подписка на музыку', regular: 'r4' });
    if (r < .38) tx(s, 'expense', R(9, 32) * 100, 'e0', { note: rnd() < .5 ? 'Продукты' : 'Супермаркет', tags: ['shop'], account: rnd() < .8 ? 'card' : 'cash' });
    if (r > .8) tx(s, 'expense', R(6, 22) * 100, 'e1', { note: rnd() < .5 ? 'Кофейня' : 'Обед в кафе' });
    if (rnd() < .3) tx(s, 'expense', R(6, 45) * 10, 'e2', { note: rnd() < .6 ? 'Метро и автобус' : 'Такси', account: rnd() < .7 ? 'card' : 'cash' });
    if (day === 18 && rnd() > .2) tx(s, 'expense', R(8, 35) * 100, 'e5', { note: 'Аптека', tags: ['health'] });
    if ((day === 9 || day === 23) && rnd() > .3) tx(s, 'expense', R(5, 30) * 100, 'e7', { note: rnd() < .5 ? 'Кино' : 'Концерт' });
    if (day === 27 && rnd() > .4) tx(s, 'expense', R(15, 60) * 100, 'e6', { note: 'Одежда', tags: ['shop'] });
  }
  tx(DD(-38), 'expense', 4200, 'e8', { project: 'p1', note: 'Вывоз мусора после демонтажа', tags: ['home'] });
  tx(DD(-12), 'expense', 8500, 'e8', { project: 'p1', note: 'Демонтаж — оплата мастеру', tags: ['home'] });
  tx(DD(-9), 'expense', 65000, 'e8', { project: 'p1', task: 'tk3', note: 'Предоплата за гарнитур', tags: ['home', 'shop'] });
  tx(DD(-4), 'expense', 12400, 'e8', { project: 'p1', note: 'Электрика: кабель, розетки', tags: ['home'] });
  tx(DD(-10), 'expense', 46800, 'e11', { project: 'p3', task: 'tk5', note: 'Авиабилеты на двоих', tags: ['trip', 'family'] });
  tx(DD(-6), 'expense', 3500, 'e9', { note: 'Подарок коллеге', tags: ['work', 'shop'] });
  const nextDay = dd => { const x = pd(t); let c = ymd(new Date(x.getFullYear(), x.getMonth(), dd)); if (c <= t) c = ymd(new Date(x.getFullYear(), x.getMonth() + 1, dd)); return c; };
  b.regular = [
    { id: 'r1', title: 'Квартплата', type: 'expense', amount: 6850, account: 'card', category: 'e3', repeat: 'month', day: 10, nextDate: nextDay(10), remind: 1, active: true, tags: ['home'] },
    { id: 'r2', title: 'Домашний интернет', type: 'expense', amount: 650, account: 'card', category: 'e4', repeat: 'month', day: 15, nextDate: nextDay(15), remind: 1, active: true, tags: [] },
    { id: 'r3', title: 'Мобильная связь', type: 'expense', amount: 450, account: 'card', category: 'e4', repeat: 'month', day: 25, nextDate: nextDay(25), remind: 0, active: true, tags: [] },
    { id: 'r4', title: 'Подписка на музыку', type: 'expense', amount: 199, account: 'card', category: 'e7', repeat: 'month', day: 3, nextDate: nextDay(3), remind: null, active: true, tags: [] },
    { id: 'r5', title: 'Страховка автомобиля', type: 'expense', amount: 14800, account: 'card', category: 'e12', repeat: 'year', day: pd(DD(16)).getDate(), nextDate: DD(16), remind: 7, active: true, tags: [] }
  ];
  return d;
}
