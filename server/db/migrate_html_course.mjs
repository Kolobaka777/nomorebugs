// One-time migration: moves the only real content that ever existed in the
// old client-side-only "static course" system (client/src/data/courseData.ts,
// course id 1 — "Основы HTML") into the DB-backed custom_courses schema, so
// it survives the removal of that parallel system (see audit Critical #5).
//
// Content sections are expressed the same way the old ContentSection[] model
// did (heading/text/code/list/tip/warning) and converted here into the
// lightweight markdown-ish convention CustomCourseLearningPage's
// LessonContent renderer already understands:
//   ## heading      > tip      ! warning      - list item      ```code```
//
// Run once: node db/migrate_html_course.mjs
// Safe to re-run: skips if a course with this title already exists.

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, 'learning_hub.db');
const db = new Database(dbPath);

function sectionsToContent(sections) {
  return sections.map(s => {
    if (s.type === 'heading') return `## ${s.content}`;
    if (s.type === 'text') return s.content;
    if (s.type === 'code') return '```\n' + s.content + '\n```';
    if (s.type === 'tip') return `> ${s.content}`;
    if (s.type === 'warning') return `! ${s.content}`;
    if (s.type === 'list') return (s.items || []).map(i => `- ${i}`).join('\n');
    return '';
  }).filter(Boolean).join('\n\n');
}

const modules = [
  {
    title: 'Модуль 1: Основы HTML',
    lessons: [
      {
        title: '1.1 Что такое HTML',
        type: 'lesson',
        sections: [
          { type: 'heading', content: 'Что такое HTML?' },
          { type: 'text', content: 'HTML расшифровывается как HyperText Markup Language — язык гипертекстовой разметки. Важно понимать сразу: HTML — это не язык программирования. В нём нет переменных, функций и условий. Это язык описания структуры документа — он объясняет браузеру, что именно показать пользователю.' },
          { type: 'heading', content: 'Зачем это QA-тестировщику?' },
          { type: 'text', content: 'Понимание HTML — это ваш базовый инструмент. Когда вы смотрите на страницу в DevTools, вы видите именно HTML-структуру. Умея её читать, вы сможете:' },
          { type: 'list', items: [
            'Точно описывать элемент в баг-репорте (не «кнопка сверху», а «кнопка с id="submit-btn" в секции .form-container»)',
            'Находить причину визуального бага (неправильный тег? лишний div? отсутствующий атрибут?)',
            'Отличать баг верстки от бага функциональности',
            'Проверять доступность (accessibility) страницы',
          ] },
          { type: 'heading', content: 'Как работает браузер' },
          { type: 'text', content: 'Когда браузер получает HTML-файл, он разбирает (parse) его построчно и строит DOM — Document Object Model. DOM — это дерево объектов, где каждый HTML-тег становится узлом. Именно это дерево вы видите во вкладке Elements в DevTools.' },
          { type: 'tip', content: 'Откройте DevTools (F12) на любой странице и перейдите на вкладку Elements. Всё, что вы видите — это DOM, построенный браузером из HTML-файла. Попробуйте навести мышь на элемент и найти его в коде.' },
        ],
      },
      {
        title: '1.2 Структура HTML-документа',
        type: 'lesson',
        sections: [
          { type: 'heading', content: 'Каждая HTML-страница выглядит так:' },
          { type: 'code', content: `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Заголовок вкладки браузера</title>
  </head>
  <body>
    <!-- Весь видимый контент здесь -->
    <h1>Привет, мир!</h1>
    <p>Это параграф текста.</p>
  </body>
</html>` },
          { type: 'heading', content: 'Разберём по частям' },
          { type: 'list', items: [
            '<!DOCTYPE html> — объявление типа документа. Всегда первая строка. Без него браузер переходит в «quirks mode» и отображает страницу непредсказуемо.',
            '<html lang="ru"> — корневой элемент. Атрибут lang указывает язык страницы (важно для скринридеров и SEO).',
            '<head> — контейнер для метаданных: charset, title, ссылки на CSS, meta-теги. Эти данные не видны на странице.',
            '<body> — весь видимый контент: текст, картинки, кнопки, формы.',
            '<!-- комментарий --> — комментарии в HTML. Не отображаются на странице, но видны в DevTools!',
          ] },
          { type: 'heading', content: 'На что обращать внимание при тестировании' },
          { type: 'list', items: [
            'Атрибут lang у <html> — должен соответствовать языку контента',
            '<title> — заголовок вкладки браузера. Проверяйте релевантность и уникальность',
            'charset="UTF-8" — без него может "сломаться" кириллица',
            'viewport meta — критично для адаптивного отображения на мобильных',
          ] },
          { type: 'tip', content: 'В DevTools вы можете редактировать HTML прямо в браузере — двойной клик на элемент. Это удобно для быстрой проверки как будет выглядеть исправление, прежде чем писать баг-репорт.' },
        ],
      },
      {
        title: '1.3 Основные теги',
        type: 'lesson',
        sections: [
          { type: 'heading', content: 'Теги — строительные блоки HTML' },
          { type: 'text', content: 'Тег — это элемент разметки в угловых скобках. Большинство тегов имеют открывающий <tag> и закрывающий </tag>. Некоторые — самозакрывающиеся: <br>, <img>, <input>, <hr>.' },
          { type: 'heading', content: 'Заголовки: <h1> — <h6>' },
          { type: 'code', content: `<h1>Главный заголовок страницы</h1>
<h2>Подзаголовок первого уровня</h2>
<h3>Подзаголовок второго уровня</h3>
<h4>И так далее...</h4>` },
          { type: 'warning', content: 'На странице должен быть только один тег <h1> — это главный заголовок. Несколько h1 — это баг (SEO-дефект + нарушение доступности). Проверяйте это при тестировании!' },
          { type: 'heading', content: 'Параграфы, блоки и строки' },
          { type: 'list', items: [
            '<p> — параграф текста. Блочный элемент, автоматические отступы сверху и снизу.',
            '<div> — универсальный блочный контейнер для группировки элементов. Сам по себе не несёт смысловой нагрузки.',
            '<span> — строчный элемент для выделения части текста внутри параграфа.',
            '<br> — принудительный перенос строки (самозакрывающийся).',
            '<hr> — горизонтальная линия-разделитель.',
          ] },
          { type: 'heading', content: 'Форматирование текста' },
          { type: 'list', items: [
            '<strong> — важный текст (жирный). Несёт смысловую нагрузку — скринридеры делают ударение.',
            '<em> — выделенный текст (курсив). Тоже смысловой — интонация при чтении.',
            '<b> — жирный (только визуальный, без смысла). Используйте <strong> вместо <b>.',
            '<i> — курсив (только визуальный). Используйте <em> вместо <i>.',
          ] },
          { type: 'tip', content: 'Частый баг: разработчики используют <b> и <i> вместо <strong> и <em>. Визуально выглядит одинаково, но нарушает доступность. Проверяйте с помощью инструмента axe DevTools.' },
        ],
      },
      {
        title: 'Тест: Модуль 1',
        type: 'quiz',
        questions: [
          { question_text: 'Что означает аббревиатура HTML?', options: ['High Text Markup Language', 'HyperText Markup Language', 'HyperText Making Language', 'High Transfer Markup Language'], correct_idx: 1, explanation: 'HTML — HyperText Markup Language, язык гипертекстовой разметки. Не программирования, а именно разметки — он описывает структуру документа.' },
          { question_text: 'Какой тег или объявление должно быть первым в HTML-документе?', options: ['<html>', '<head>', '<!DOCTYPE html>', '<body>'], correct_idx: 2, explanation: '<!DOCTYPE html> всегда идёт первым. Оно объявляет браузеру тип документа. Без него браузер может перейти в «quirks mode».' },
          { question_text: 'Где размещаются метаданные страницы (charset, title, viewport)?', options: ['В <body>', 'В <head>', 'В <html>', 'В <footer>'], correct_idx: 1, explanation: '<head> содержит метаданные — информацию о странице, которая не отображается пользователю. Charset, title, ссылки на CSS — всё туда.' },
          { question_text: 'Сколько тегов <h1> рекомендуется использовать на одной странице?', options: ['Неограниченно', 'Не больше пяти', 'Только один', 'Ровно два'], correct_idx: 2, explanation: 'На странице должен быть один <h1> — главный заголовок. Несколько h1 — это SEO-дефект и нарушение структуры доступности.' },
          { question_text: 'Что такое DOM?', options: ['Расширение файла HTML-документа', 'Язык программирования для браузеров', 'Дерево объектов, построенное браузером из HTML', 'База данных браузера'], correct_idx: 2, explanation: 'DOM (Document Object Model) — это дерево объектов, которое браузер строит из HTML. Именно его вы видите во вкладке Elements в DevTools.' },
        ],
      },
    ],
  },
  {
    title: 'Модуль 2: Теги и атрибуты',
    lessons: [
      {
        title: '2.1 Атрибуты тегов',
        type: 'lesson',
        sections: [
          { type: 'heading', content: 'Что такое атрибуты?' },
          { type: 'text', content: 'Атрибуты добавляют дополнительную информацию к тегам. Они записываются внутри открывающего тега в формате name="value".' },
          { type: 'code', content: `<a href="https://example.com" target="_blank">Ссылка</a>
<img src="photo.jpg" alt="Описание фото" width="300">
<input type="email" placeholder="Ваш email" required>
<div id="header" class="container dark-theme" data-section="top">...</div>` },
          { type: 'heading', content: 'Атрибуты id и class — самые важные' },
          { type: 'list', items: [
            'id — уникальный идентификатор элемента. На странице должен быть только один элемент с конкретным id. Используется в CSS (#submit-btn) и JavaScript (getElementById). Дублирование id — это баг!',
            'class — класс(ы) элемента. Один класс может быть у многих элементов. Используется для стилизации (.btn-primary) и в тестах.',
          ] },
          { type: 'tip', content: 'Когда пишете баг-репорт, укажите id или class элемента: «Кнопка id="cta-submit" в блоке .hero-section». Разработчику не придётся угадывать что именно сломано.' },
          { type: 'heading', content: 'Другие важные атрибуты' },
          { type: 'list', items: [
            'href — ссылка (для <a>). Может быть абсолютным URL или относительным путём.',
            'src — путь к файлу (для <img>, <script>, <iframe>).',
            'alt — альтернативный текст для изображений. Критично для доступности и SEO.',
            'title — всплывающая подсказка при наведении курсора.',
            'data-* — кастомные атрибуты для передачи данных. Например: data-user-id="42", data-analytics="click_banner".',
          ] },
        ],
      },
      {
        title: '2.2 Ссылки и изображения',
        type: 'lesson',
        sections: [
          { type: 'heading', content: 'Тег <a> — гиперссылки' },
          { type: 'code', content: `<!-- Внешняя ссылка (откроется в новой вкладке) -->
<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>

<!-- Внутренняя ссылка (другая страница сайта) -->
<a href="/about">О нас</a>

<!-- Якорная ссылка (прокрутка к элементу на этой странице) -->
<a href="#section-2">Перейти к разделу 2</a>

<!-- Mailto — открывает почтовый клиент -->
<a href="mailto:info@example.com">Написать нам</a>

<!-- Tel — на мобильных открывает звонок -->
<a href="tel:+79001234567">+7 900 123-45-67</a>` },
          { type: 'heading', content: 'Что проверять при тестировании ссылок' },
          { type: 'list', items: [
            'URL корректный — нет опечаток, 404 не возникает',
            'Внешние ссылки открываются в новой вкладке (target="_blank")',
            'При target="_blank" есть rel="noopener noreferrer" (безопасность)',
            'Якорные ссылки (#id) ведут к нужному разделу страницы',
            'Mailto-ссылки открывают почтовый клиент',
            'Tel-ссылки на мобильных предлагают позвонить',
          ] },
          { type: 'heading', content: 'Тег <img> — изображения' },
          { type: 'code', content: `<img
  src="images/banner.jpg"
  alt="Акция: скидка 50% на все курсы до конца месяца"
  width="800"
  height="400"
  loading="lazy"
>` },
          { type: 'heading', content: 'Что тестировать у изображений' },
          { type: 'list', items: [
            'Нет broken images (сломанных картинок — иконка с ошибкой)',
            'Атрибут alt заполнен осмысленно (не "image1.jpg" и не пустой)',
            'Декоративные изображения имеют пустой alt="" (намеренно)',
            'Изображение корректно масштабируется на мобильном (не выходит за границы)',
            'Тяжёлые изображения не тормозят загрузку страницы',
          ] },
          { type: 'tip', content: 'В DevTools во вкладке Network отфильтруйте запросы по типу "Img". Статус 200 = ОК, 404 = сломано. Так быстро находите все битые изображения.' },
        ],
      },
      {
        title: '2.3 Списки',
        type: 'lesson',
        sections: [
          { type: 'heading', content: 'Три вида списков в HTML' },
          { type: 'code', content: `<!-- Ненумерованный список -->
<ul>
  <li>Проверить открытие страницы</li>
  <li>Проверить консоль на ошибки</li>
  <li>Проверить адаптивность</li>
</ul>

<!-- Нумерованный список — когда порядок важен -->
<ol>
  <li>Открыть страницу</li>
  <li>Заполнить форму</li>
  <li>Нажать кнопку отправки</li>
  <li>Проверить результат</li>
</ol>

<!-- Список определений — термин + определение -->
<dl>
  <dt>HTML</dt>
  <dd>Язык гипертекстовой разметки</dd>
  <dt>CSS</dt>
  <dd>Каскадные таблицы стилей</dd>
</dl>` },
          { type: 'heading', content: 'На что обратить внимание при тестировании' },
          { type: 'list', items: [
            'Элементы <li> должны быть прямыми потомками <ul> или <ol>, не <div>',
            'Нумерованный <ol> — для последовательных шагов (инструкции, чекаут)',
            'Ненумерованный <ul> — для перечислений без порядка',
            'Списки можно вкладывать друг в друга (nested)',
            'Пустой список (<ul></ul>) — может быть багом, проверьте логику',
          ] },
          { type: 'tip', content: 'Если видите неверный порядок в нумерованном списке — загляните в HTML. Возможно <li> переставлены в разметке, или CSS counter сбит.' },
        ],
      },
      {
        title: 'Тест: Модуль 2',
        type: 'quiz',
        questions: [
          { question_text: 'Какой атрибут задаёт уникальный идентификатор элемента?', options: ['class', 'id', 'name', 'key'], correct_idx: 1, explanation: 'id — уникальный идентификатор. На всей странице должен встречаться только один раз. Дублирование id — баг.' },
          { question_text: 'Для чего нужен атрибут alt у изображения?', options: ['Задать размер изображения', 'Указать URL изображения', 'Альтернативный текст при недоступности изображения', 'Добавить подпись под изображением'], correct_idx: 2, explanation: 'alt — альтернативный текст, который показывается если изображение не загрузилось, и который читают скринридеры для незрячих пользователей.' },
          { question_text: 'Как правильно открыть ссылку в новой вкладке?', options: ['href="_blank"', 'target="new"', 'target="_blank"', 'open="true"'], correct_idx: 2, explanation: 'target="_blank" открывает ссылку в новой вкладке. Для безопасности добавляйте rel="noopener noreferrer".' },
          { question_text: 'Какой список использовать для пошаговой инструкции?', options: ['<ul> — ненумерованный', '<ol> — нумерованный', '<dl> — список определений', '<list>'], correct_idx: 1, explanation: '<ol> (ordered list) — нумерованный список для последовательных шагов, где порядок имеет значение.' },
          { question_text: 'Что делают data-атрибуты (например, data-user-id="42")?', options: ['Атрибут для хранения дат', 'Обязательный HTML-атрибут', 'Кастомный атрибут для хранения произвольных данных', 'Атрибут для работы с базой данных'], correct_idx: 2, explanation: 'data-* атрибуты — это кастомные атрибуты для хранения данных. JavaScript может их читать через dataset. Часто используются для аналитики и передачи параметров.' },
        ],
      },
    ],
  },
  {
    title: 'Модуль 3: Формы и семантика',
    lessons: [
      {
        title: '3.1 HTML-формы',
        type: 'lesson',
        sections: [
          { type: 'heading', content: 'Форма — главный объект тестирования' },
          { type: 'text', content: 'Формы — это то, с чем тестировщик работает постоянно. Форма позволяет пользователю ввести данные и отправить их на сервер. Заявки, регистрации, чекауты — всё это формы.' },
          { type: 'code', content: `<form action="/submit" method="POST">

  <label for="name">Имя:</label>
  <input type="text" id="name" name="name" required placeholder="Иван">

  <label for="email">Email:</label>
  <input type="email" id="email" name="email" required>

  <label for="phone">Телефон:</label>
  <input type="tel" id="phone" name="phone" placeholder="+7 (000) 000-00-00">

  <label for="message">Сообщение:</label>
  <textarea id="message" name="message" rows="4" maxlength="500"></textarea>

  <button type="submit">Отправить заявку</button>

</form>` },
          { type: 'heading', content: 'Типы полей ввода (input type)' },
          { type: 'list', items: [
            'text — обычное текстовое поле',
            'email — поле email (браузер валидирует формат автоматически)',
            'password — поле пароля (скрывает вводимые символы)',
            'number — числовое поле (стрелки вверх/вниз)',
            'tel — телефонный номер',
            'checkbox — чекбокс (выбрать/снять, независимый)',
            'radio — радиокнопка (один вариант из группы)',
            'file — выбор файла для загрузки',
            'hidden — скрытое поле (не видно, но отправляется с формой)',
            'date — выбор даты через календарь',
          ] },
          { type: 'heading', content: 'Атрибуты полей' },
          { type: 'list', items: [
            'required — поле обязательно для заполнения',
            'disabled — поле заблокировано (нельзя вводить, не отправляется)',
            'readonly — только для чтения (нельзя редактировать, но отправляется)',
            'placeholder — подсказка в пустом поле',
            'maxlength — максимальное количество символов',
            'min / max — минимальное и максимальное значение (для number и date)',
            'pattern — регулярное выражение для валидации',
            'autocomplete — подсказки из истории браузера',
          ] },
          { type: 'warning', content: 'Чеклист тестирования форм: пустая обязательная форма → ошибка; невалидный email → ошибка; граничные значения maxlength; двойная отправка; <script>alert(1)</script> в текстовых полях (XSS); форма работает без JS.' },
        ],
      },
      {
        title: '3.2 Семантические теги',
        type: 'lesson',
        sections: [
          { type: 'heading', content: 'Что такое семантика?' },
          { type: 'text', content: 'Семантика — это смысл. Семантические теги не просто группируют контент, они объясняют что это за контент. Сравните два варианта:' },
          { type: 'code', content: `<!-- НЕ семантично — всё div-ы без смысла -->
<div id="header">Шапка сайта</div>
<div id="nav">Меню</div>
<div id="main-content">Основной контент</div>
<div id="sidebar">Боковая колонка</div>
<div id="footer">Подвал</div>

<!-- Семантично — теги описывают роль контента -->
<header>Шапка сайта</header>
<nav>Меню</nav>
<main>Основной контент</main>
<aside>Боковая колонка</aside>
<footer>Подвал</footer>` },
          { type: 'heading', content: 'Основные семантические теги' },
          { type: 'list', items: [
            '<header> — шапка страницы или секции (логотип, навигация, поиск)',
            '<footer> — подвал страницы (контакты, копирайт, ссылки)',
            '<nav> — блок навигации (основное меню, хлебные крошки)',
            '<main> — основной уникальный контент страницы (только ОДИН на странице!)',
            '<section> — тематическая секция контента',
            '<article> — самостоятельный материал (статья, карточка товара, комментарий)',
            '<aside> — боковая колонка, дополнительный контент',
            '<figure> и <figcaption> — медиа-контент с подписью',
          ] },
          { type: 'heading', content: 'Почему это важно для QA?' },
          { type: 'list', items: [
            'SEO — поисковики лучше понимают структуру страницы',
            'Доступность — скринридеры навигируют по семантическим элементам (слабовидящие пользователи)',
            'Тестируемость — можно искать элементы по тегу, а не только по классу',
            'Стандарты — отсутствие семантики может быть требованием проекта или WCAG',
          ] },
          { type: 'tip', content: 'Инструменты для проверки доступности: axe DevTools (расширение Chrome), WAVE. Они сразу покажут проблемы с семантикой: дублирование main, отсутствие nav, неверная иерархия заголовков.' },
        ],
      },
      {
        title: 'Тест: Модуль 3',
        type: 'quiz',
        questions: [
          { question_text: 'Какой атрибут делает поле формы обязательным к заполнению?', options: ['mandatory', 'required', 'obligatory', 'must'], correct_idx: 1, explanation: 'required — стандартный HTML-атрибут для обязательных полей. При попытке отправить пустое required-поле браузер покажет ошибку.' },
          { question_text: 'Что происходит с полем с атрибутом disabled?', options: ['Поле скрыто от пользователя', 'Поле нельзя редактировать и оно не отправляется с формой', 'Поле только для чтения, но отправляется', 'Поле становится обязательным'], correct_idx: 1, explanation: 'disabled — поле заблокировано: нельзя кликнуть, вводить данные. Его значение НЕ отправляется с формой. Отличие от readonly: readonly отправляется.' },
          { question_text: 'Какой семантический тег используется для основного контента страницы?', options: ['<section>', '<article>', '<main>', '<div id="content">'], correct_idx: 2, explanation: '<main> содержит основной уникальный контент страницы. На странице должен быть только один <main>.' },
          { question_text: 'Для чего используется input type="hidden"?', options: ['Поле видно только администратору', 'Поле не видно пользователю, но отправляется с формой', 'Поле с зашифрованными данными', 'То же что type="password"'], correct_idx: 1, explanation: 'hidden — невидимое поле. Используется для передачи технических данных (ID, токены, utm-метки). Не отображается, но попадает в данные формы.' },
          { question_text: 'Почему семантическая разметка важна для тестировщика?', options: ['Только ускоряет загрузку страницы', 'Улучшает SEO, доступность и тестируемость', 'Делает страницу визуально красивее', 'Снижает количество кода'], correct_idx: 1, explanation: 'Семантика важна для SEO, доступности (assistive technologies), и делает код понятнее. Как тестировщик вы можете проверять её с помощью axe DevTools.' },
        ],
      },
    ],
  },
  {
    title: 'Итоговый тест',
    lessons: [
      {
        title: 'Итоговый тест по курсу',
        type: 'quiz',
        questions: [
          { question_text: 'HTML — это...', options: ['Язык программирования для создания веб-приложений', 'Язык разметки для описания структуры веб-страницы', 'Система управления базами данных', 'Фреймворк для создания интерфейсов'], correct_idx: 1, explanation: 'HTML — HyperText Markup Language, язык разметки. Он описывает структуру, но не содержит логики — для этого есть JavaScript.' },
          { question_text: 'Где хранятся метаданные HTML-страницы?', options: ['В <body>', 'В <head>', 'В корневом <html>', 'В <meta>'], correct_idx: 1, explanation: '<head> содержит все метаданные: charset, title, viewport, описание, ссылки на CSS.' },
          { question_text: 'Какой тег <h?> должен быть единственным на странице?', options: ['<h2>', '<h1>', '<h3>', 'Все заголовки должны быть уникальными'], correct_idx: 1, explanation: '<h1> — главный заголовок страницы. Рекомендуется использовать ровно один для правильной структуры и SEO.' },
          { question_text: 'Что такое атрибут id?', options: ['Стиль элемента', 'Уникальный идентификатор — должен встречаться один раз на странице', 'Класс для групповой стилизации', 'Обязательный атрибут всех тегов'], correct_idx: 1, explanation: 'id — уникальный идентификатор элемента. На странице один конкретный id может встречаться только один раз.' },
          { question_text: 'Как открыть ссылку в новой вкладке безопасно?', options: ['href="new_tab"', 'target="_blank" rel="noopener noreferrer"', 'open="blank"', 'target="new" secure="true"'], correct_idx: 1, explanation: 'target="_blank" открывает в новой вкладке. rel="noopener noreferrer" закрывает уязвимость, по которой открытая вкладка могла управлять родительской.' },
          { question_text: 'Какой тип input скрывает вводимые символы?', options: ['type="hidden"', 'type="secure"', 'type="password"', 'type="secret"'], correct_idx: 2, explanation: 'type="password" скрывает вводимые символы (заменяет на точки). type="hidden" — невидимое поле для передачи данных.' },
          { question_text: 'Чем отличается disabled от readonly?', options: ['Ничем, это одно и то же', 'disabled — заблокировано и не отправляется; readonly — только чтение, но отправляется', 'readonly — заблокировано; disabled — только чтение', 'disabled скрывает поле, readonly блокирует'], correct_idx: 1, explanation: 'disabled — нельзя взаимодействовать, значение не отправляется в форме. readonly — нельзя редактировать, но значение отправляется.' },
          { question_text: 'Для чего нужен атрибут alt у изображений?', options: ['Всплывающая подсказка при наведении', 'Альтернативный текст для доступности и случая когда картинка не загрузилась', 'Название файла изображения', 'SEO-описание, которое видят только поисковики'], correct_idx: 1, explanation: 'alt отображается если картинка не загрузилась, и читается скринридерами. Также учитывается поисковиками для индексации.' },
          { question_text: 'Какой семантический тег используется для навигации?', options: ['<menu>', '<nav>', '<navigation>', '<header>'], correct_idx: 1, explanation: '<nav> — семантический тег для блоков навигации: главное меню, хлебные крошки, пагинация.' },
          { question_text: 'Как быстро открыть DevTools для инспекции элемента страницы?', options: ['Ctrl+U (просмотр исходного кода)', 'F12 или правая кнопка мыши → «Просмотреть код»', 'Ctrl+Shift+Delete', 'Alt+F4'], correct_idx: 1, explanation: 'F12 открывает DevTools. Или можно кликнуть правой кнопкой на элементе → «Просмотреть код» (Inspect) — это сразу подсветит нужный элемент в DOM.' },
        ],
      },
    ],
  },
];

const TITLE = 'Основы HTML';
const existing = db.prepare('SELECT id FROM custom_courses WHERE title = ?').get(TITLE);
if (existing) {
  console.log(`Course "${TITLE}" already exists (id=${existing.id}) — skipping migration.`);
  process.exit(0);
}

const lead = db.prepare("SELECT id FROM users WHERE role = 'lead' ORDER BY id LIMIT 1").get();
if (!lead) {
  console.error('No lead user found in the database — run the seed script first, or create a lead account before migrating.');
  process.exit(1);
}

const insertCourse = db.prepare(`
  INSERT INTO custom_courses (title, description, tag, color, requirements, is_published, created_by, updated_at)
  VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
`);
const courseId = insertCourse.run(
  TITLE,
  'Фундамент веб-тестирования. Вы научитесь читать HTML-разметку, понимать структуру страницы, разбираться в тегах, атрибутах и формах. После курса вы сможете точно описывать дефекты в баг-репортах, работать с DevTools на уровне кода и понимать причины визуальных проблем.',
  'HTML',
  '#1D9E75',
  'Этот курс создан для новичков — никаких предварительных знаний не требуется. Подойдёт если вы только начинаете и хотите разобраться что вообще происходит на страницах, которые тестируете.',
  lead.id
).lastInsertRowid;

const insertModule = db.prepare('INSERT INTO custom_modules (course_id, title, order_num) VALUES (?, ?, ?)');
const insertLesson = db.prepare('INSERT INTO custom_lessons (module_id, title, type, content, order_num) VALUES (?, ?, ?, ?, ?)');
const insertQuestion = db.prepare(`
  INSERT INTO custom_quiz_questions (lesson_id, question_text, option_a, option_b, option_c, option_d, correct_idx, explanation, order_num)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let lessonCount = 0, questionCount = 0;
modules.forEach((mod, mIdx) => {
  const modId = insertModule.run(courseId, mod.title, mIdx).lastInsertRowid;
  mod.lessons.forEach((lesson, lIdx) => {
    const content = lesson.type === 'lesson' ? sectionsToContent(lesson.sections) : '';
    const lessonId = insertLesson.run(modId, lesson.title, lesson.type, content, lIdx).lastInsertRowid;
    lessonCount++;
    if (lesson.type === 'quiz') {
      lesson.questions.forEach((q, qIdx) => {
        insertQuestion.run(
          lessonId, q.question_text,
          q.options[0], q.options[1], q.options[2], q.options[3],
          q.correct_idx, q.explanation, qIdx
        );
        questionCount++;
      });
    }
  });
});

console.log(`Migrated "${TITLE}" as custom_courses.id=${courseId}: ${modules.length} modules, ${lessonCount} lessons, ${questionCount} quiz questions.`);
db.close();
