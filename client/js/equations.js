// ============================================================
// equations.js — сохранение, загрузка и удаление моделей
// ============================================================

// Адрес API. Должен совпадать с портом сервера (см. AGENTS.md).
const API_URL = "http://localhost:3001/api/models";

// ------------------------------------------------------------------
// Сохраняет текущую модель (название + текст системы ОДУ) на сервер.
// Текст берётся через serializeEquation() (main.js): дроби вида dS/dt
// превращаются в компактную строку, а греческие буквы (β, γ) остаются
// — в базе хранится человекочитаемый «чистый» текст, который позже
// разберёт парсер (этап 1). После сохранения список обновляется.
// ------------------------------------------------------------------
async function saveEquation() {
  const name = document.getElementById("equation-name").value.trim();
  const equationText = serializeEquation();

  if (!name || !equationText) {
    showToast("Введите название и уравнение", "error");
    return;
  }

  // Разбираем систему парсером (этап 1): при успехе сохраняем
  // структуру в JSONB-поле models, при ошибке — модель всё равно
  // сохраняется, но без структуры (ошибку видно в тосте и в подсказке)
  const parsed = parseOdeSystemSafe(equationText);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        raw_text: equationText,
        structure: parsed.ok ? parsed.structure : null,
      }),
    });

    if (response.ok) {
      // Очищаем поля ввода после успешного сохранения
      document.getElementById("equation-name").value = "";
      document.getElementById("equation-input").innerHTML = "";
      await loadSavedEquations();
      updateDiagram();
      updateParseInfo();
      if (parsed.ok) {
        showToast("Модель сохранена");
      } else {
        showToast("Модель сохранена без структуры: " + parsed.error, "error");
      }
    } else {
      showToast("Ошибка при сохранении модели", "error");
    }
  } catch (error) {
    console.error("Ошибка:", error);
    showToast("Сервер недоступен — проверьте, что он запущен", "error");
  }
}

// ------------------------------------------------------------------
// Загружает список сохранённых моделей с сервера и отрисовывает
// карточки в левой панели. Каждая карточка показывает название,
// первые символы системы и дату создания; по клику модель
// открывается в редакторе.
// ------------------------------------------------------------------
async function loadSavedEquations() {
  try {
    const response = await fetch(API_URL);
    const models = await response.json();

    const container = document.getElementById("saved-equations");
    container.innerHTML = "";

    if (models.length === 0) {
      container.innerHTML =
        '<p class="text-sm text-slate-600 mt-2">Пока нет сохранённых моделей</p>';
      return;
    }

    models.forEach((model) => {
      container.appendChild(renderModelCard(model));
    });
  } catch (error) {
    console.error("Ошибка загрузки:", error);
    document.getElementById("saved-equations").innerHTML =
      '<p class="text-sm text-rose-400 mt-2">Не удалось загрузить список моделей</p>';
  }
}

// ------------------------------------------------------------------
// Создаёт DOM-элемент карточки одной сохранённой модели.
// Карточка кликабельна (открыть в редакторе) и содержит кнопку
// удаления с крестиком. Обработчик удаления останавливает всплытие
// клика, чтобы не сработало открытие модели.
// ------------------------------------------------------------------
function renderModelCard(model) {
  const div = document.createElement("div");
  div.className =
    "group p-3 border border-slate-700/60 rounded-xl mb-2 cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5 transition bg-ink-800/50";

  const preview = (model.raw_text || "").split("\n").slice(0, 2).join("\n");

  div.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="font-semibold text-emerald-300/90 text-sm truncate">${escapeHtml(model.name)}</div>
        <div class="text-xs text-slate-500 mt-0.5 whitespace-pre-line leading-snug">${escapeHtml(preview)}</div>
        <div class="text-[11px] text-slate-600 mt-1">${new Date(model.created_at).toLocaleString()}</div>
      </div>
      <button
        class="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition opacity-0 group-hover:opacity-100"
        title="Удалить модель"
        onclick="event.stopPropagation(); deleteModel(${model.id})"
      >✕</button>
    </div>
  `;

  div.onclick = () => loadEquation(model);
  return div;
}

// ------------------------------------------------------------------
// Удаляет модель с сервера и обновляет список. Ошибка 404 (модель
// уже удалена, например другим окном) обрабатывается отдельно.
// ------------------------------------------------------------------
async function deleteModel(id) {
  try {
    const response = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    if (response.ok) {
      showToast("Модель удалена");
    } else if (response.status === 404) {
      showToast("Модель уже не существует", "error");
    } else {
      showToast("Ошибка при удалении", "error");
    }
    await loadSavedEquations();
  } catch (error) {
    console.error("Ошибка удаления:", error);
    showToast("Сервер недоступен", "error");
  }
}

// ------------------------------------------------------------------
// Загружает сохранённую модель в редактор: подставляет название
// и текст системы ОДУ, затем перерисовывает блок-схему.
// ------------------------------------------------------------------
function loadEquation(model) {
  document.getElementById("equation-name").value = model.name;
  document.getElementById("equation-input").innerText = model.raw_text || "";
  updateDiagram();
  updateParseInfo();
  showToast(`Загружено: ${model.name}`);
}

// ------------------------------------------------------------------
// Экранирует HTML-спецсимволы пользовательского ввода.
// Защита от «инъекции»: иначе название модели вида <img onerror=...>
// выполнило бы этот код при вставке через innerHTML.
// ------------------------------------------------------------------
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}