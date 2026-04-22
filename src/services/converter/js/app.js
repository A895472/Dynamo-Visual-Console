/**
 * Módulo principal de la aplicación.
 * Orquesta la interacción entre UI, parser, generador y almacenamiento.
 */

import { parseRule, ParseError } from './parser/parser.js';
import { TokenizerError } from './parser/tokenizer.js';
import { generateDynamoRule } from './parser/generator.js';
import { dynamoJsonToText } from './parser/reverser.js';
import { validateDynamoSchema } from './parser/validator.js';

const KNOWN_FIELDS = [
  { path: 'payload.mensaje.envio.codaplicacion', type: 'Int' },
  { path: 'payload.mensaje.envio.eventosenvio.evento.codevento', type: 'String' },
  { path: 'payload.mensaje.envio.datosservicio.tipoprod.codupu', type: 'String' },
  { path: 'payload.mensaje.envio.datosenvio.codproducto', type: 'String' },
  { path: 'payload.mensaje.envio.datosenvio.referenciaenvio', type: 'String' },
  { path: 'payload.mensaje.envio.datosenvio.codpais', type: 'String' },
  { path: 'payload.mensaje.envio.datosservicio.codservicio', type: 'String' },
  { path: 'payload.mensaje.envio.datosservicio.tiposervicio', type: 'String' },
  { path: 'payload.mensaje.envio.datosservicio.modalidad', type: 'String' },
  { path: 'payload.mensaje.envio.datosdir.codpostal', type: 'String' },
  { path: 'payload.mensaje.envio.datosdir.provincia', type: 'String' },
  { path: 'payload.mensaje.envio.datosdir.localidad', type: 'String' },
  { path: 'payload.mensaje.envio.peso', type: 'Double' },
  { path: 'payload.mensaje.envio.numpaquetes', type: 'Int' },
  { path: 'payload.mensaje.envio.remitente.nombre', type: 'String' },
  { path: 'payload.mensaje.envio.destinatario.nombre', type: 'String' },
  { path: 'payload.mensaje.envio.estado', type: 'String' },
  { path: 'payload.mensaje.envio.fecharecogida', type: 'String' },
  { path: 'payload.mensaje.envio.fechaentrega', type: 'String' },
  { path: 'payload.mensaje.envio.urgente', type: 'Boolean' },
];

const HISTORY_KEY = 'dynamo_rule_converter_history';
const MAX_HISTORY = 50;

class App {
  constructor() {
    this.currentJson = null;
    this.builderConditions = [this.createEmptyCondition()];
    this.builderLogicOp = 'AND';
    this.autocompleteVisible = false;
    this.autocompleteIdx = -1;
    this.autocompleteTarget = null;

    this.initElements();
    this.initTabs();
    this.initConverter();
    this.initImport();
    this.initBuilder();
    this.initHistory();
  }

  // ─── DOM Elements ───

  initElements() {
    this.tabs = document.querySelectorAll('.nav-tab');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.ruleInput = document.getElementById('ruleInput');
    this.jsonOutput = document.getElementById('jsonOutput');
    this.errorBox = document.getElementById('errorBox');
    this.successBox = document.getElementById('successBox');
    this.metaName = document.getElementById('metaName');
    this.metaDesc = document.getElementById('metaDesc');
    this.metaEnv = document.getElementById('metaEnv');
    this.metaVersion = document.getElementById('metaVersion');
    this.toastContainer = document.getElementById('toastContainer');

    this.importInput = document.getElementById('importInput');
    this.importOutput = document.getElementById('importOutput');

    this.conditionsList = document.getElementById('conditionsList');
    this.builderTextPreview = document.getElementById('builderTextPreview');
    this.builderJsonPreview = document.getElementById('builderJsonPreview');

    this.historyList = document.getElementById('historyList');

    this.autocompleteEl = document.getElementById('autocomplete');
  }

  // ─── Tabs ───

  initTabs() {
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        this.tabs.forEach(t => t.classList.remove('active'));
        this.tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${target}`).classList.add('active');
        if (target === 'history') this.renderHistory();
      });
    });
  }

  // ─── Converter ───

  initConverter() {
    document.getElementById('btnConvert').addEventListener('click', () => this.convert());
    document.getElementById('btnCopy').addEventListener('click', () => this.copyJson());
    document.getElementById('btnDownload').addEventListener('click', () => this.downloadJson());
    document.getElementById('btnValidate').addEventListener('click', () => this.validateJson());
    document.getElementById('btnClear').addEventListener('click', () => this.clearConverter());

    this.ruleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.convert();
      }
    });

    this.initAutocomplete();
  }

  convert() {
    const input = this.ruleInput.value.trim();
    this.hideError();
    this.hideSuccess();

    if (!input) {
      this.showError('La expresión de regla está vacía', 'Escribe una regla en formato texto para convertirla.');
      return;
    }

    try {
      const ast = parseRule(input);
      const metadata = {
        ruleName: this.metaName.value || undefined,
        description: this.metaDesc.value || undefined,
        environment: this.metaEnv.value || undefined,
        version: this.metaVersion.value || undefined,
      };
      const json = generateDynamoRule(ast, metadata);
      this.currentJson = json;
      this.renderJson(json);
      this.saveToHistory(input, json);
      this.showSuccess('Regla convertida correctamente');
    } catch (err) {
      this.handleParseError(err, input);
    }
  }

  handleParseError(err, input) {
    if (err instanceof ParseError || err instanceof TokenizerError) {
      const pos = err.position || 0;
      const before = input.substring(0, pos);
      const errorChar = input.substring(pos, pos + (err.token?.length || 1));
      const after = input.substring(pos + (err.token?.length || 1));

      this.showError(
        err.message,
        `Posición: ${pos}`,
        before,
        errorChar,
        after
      );
    } else {
      this.showError('Error inesperado', err.message);
    }
  }

  renderJson(json) {
    const formatted = JSON.stringify(json, null, 2);
    this.jsonOutput.innerHTML = this.highlightJson(formatted);
  }

  highlightJson(jsonStr) {
    return jsonStr.replace(
      /("(?:\\.|[^"\\])*")\s*:/g,
      '<span class="json-key">$1</span>:'
    ).replace(
      /:\s*("(?:\\.|[^"\\])*")/g,
      ': <span class="json-string">$1</span>'
    ).replace(
      /:\s*(\d+\.?\d*)/g,
      ': <span class="json-number">$1</span>'
    ).replace(
      /:\s*(true|false)/g,
      ': <span class="json-boolean">$1</span>'
    ).replace(
      /:\s*(null)/g,
      ': <span class="json-null">$1</span>'
    ).replace(
      /([{}[\]])/g,
      '<span class="json-brace">$1</span>'
    );
  }

  copyJson() {
    if (!this.currentJson) {
      this.showToast('No hay JSON para copiar', 'error');
      return;
    }
    const text = JSON.stringify(this.currentJson, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('JSON copiado al portapapeles', 'success');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast('JSON copiado al portapapeles', 'success');
    });
  }

  downloadJson() {
    if (!this.currentJson) {
      this.showToast('No hay JSON para descargar', 'error');
      return;
    }
    const text = JSON.stringify(this.currentJson, null, 2);
    const name = this.metaName.value || 'regla_dynamo';
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Archivo descargado', 'success');
  }

  validateJson() {
    if (!this.currentJson) {
      this.showToast('Primero convierte una regla', 'error');
      return;
    }
    const errors = validateDynamoSchema(this.currentJson);
    const container = document.getElementById('validationResults');
    container.innerHTML = '';

    if (errors.length === 0) {
      container.innerHTML = `
        <div class="validation-item success">
          <span>&#10003;</span>
          <span>El JSON cumple con el esquema Dynamo correctamente</span>
        </div>`;
    } else {
      errors.forEach(err => {
        container.innerHTML += `
          <div class="validation-item error">
            <span>&#10007;</span>
            <span class="path">${err.path}</span>
            <span>${err.message}</span>
          </div>`;
      });
    }
  }

  clearConverter() {
    this.ruleInput.value = '';
    this.ruleInput.classList.remove('error');
    this.currentJson = null;
    this.jsonOutput.innerHTML = '<div class="json-placeholder">El JSON generado aparecerá aquí</div>';
    this.hideError();
    this.hideSuccess();
    document.getElementById('validationResults').innerHTML = '';
  }

  // ─── Autocomplete ───

  initAutocomplete() {
    this.ruleInput.addEventListener('input', () => this.handleAutocomplete());
    this.ruleInput.addEventListener('keydown', (e) => this.handleAutocompleteKey(e));
    document.addEventListener('click', (e) => {
      if (!this.autocompleteEl.contains(e.target) && e.target !== this.ruleInput) {
        this.hideAutocomplete();
      }
    });
  }

  handleAutocomplete() {
    const val = this.ruleInput.value;
    const cursor = this.ruleInput.selectionStart;
    const textBefore = val.substring(0, cursor);
    const wordMatch = textBefore.match(/([a-zA-Z_][a-zA-Z0-9_.]*$)/);

    if (!wordMatch || wordMatch[1].length < 2) {
      this.hideAutocomplete();
      return;
    }

    const partial = wordMatch[1].toLowerCase();
    const matches = KNOWN_FIELDS.filter(f =>
      f.path.toLowerCase().includes(partial)
    ).slice(0, 8);

    if (matches.length === 0) {
      this.hideAutocomplete();
      return;
    }

    this.autocompleteTarget = { start: cursor - wordMatch[1].length, end: cursor };
    this.autocompleteIdx = -1;
    this.autocompleteEl.innerHTML = matches.map((f, i) =>
      `<div class="autocomplete-item" data-index="${i}" data-path="${f.path}">
        <span class="field-path">${f.path}</span>
        <span class="field-type">${f.type}</span>
      </div>`
    ).join('');

    this.autocompleteEl.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => this.selectAutocomplete(item.dataset.path));
    });

    this.autocompleteEl.classList.add('visible');
    this.autocompleteVisible = true;
  }

  handleAutocompleteKey(e) {
    if (!this.autocompleteVisible) return;

    const items = this.autocompleteEl.querySelectorAll('.autocomplete-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.autocompleteIdx = Math.min(this.autocompleteIdx + 1, items.length - 1);
      this.updateAutocompleteSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.autocompleteIdx = Math.max(this.autocompleteIdx - 1, 0);
      this.updateAutocompleteSelection(items);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (this.autocompleteIdx >= 0) {
        e.preventDefault();
        this.selectAutocomplete(items[this.autocompleteIdx].dataset.path);
      }
    } else if (e.key === 'Escape') {
      this.hideAutocomplete();
    }
  }

  updateAutocompleteSelection(items) {
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === this.autocompleteIdx);
    });
  }

  selectAutocomplete(path) {
    if (!this.autocompleteTarget) return;
    const val = this.ruleInput.value;
    const before = val.substring(0, this.autocompleteTarget.start);
    const after = val.substring(this.autocompleteTarget.end);
    this.ruleInput.value = before + path + after;
    const newPos = this.autocompleteTarget.start + path.length;
    this.ruleInput.setSelectionRange(newPos, newPos);
    this.ruleInput.focus();
    this.hideAutocomplete();
  }

  hideAutocomplete() {
    this.autocompleteEl.classList.remove('visible');
    this.autocompleteVisible = false;
    this.autocompleteIdx = -1;
  }

  // ─── Import ───

  initImport() {
    document.getElementById('btnImportConvert').addEventListener('click', () => this.importConvert());
    document.getElementById('btnImportValidate').addEventListener('click', () => this.importValidate());
    document.getElementById('btnImportFile').addEventListener('click', () => {
      document.getElementById('fileImport').click();
    });
    document.getElementById('fileImport').addEventListener('change', (e) => this.handleFileImport(e));
  }

  importConvert() {
    const raw = this.importInput.value;
    const input = raw.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').trim();
    const importError = document.getElementById('importError');
    const importSuccess = document.getElementById('importSuccess');
    importError.classList.remove('visible');
    importSuccess.classList.remove('visible');

    if (!input) {
      importError.querySelector('.error-title').textContent = 'El JSON está vacío';
      importError.querySelector('.error-detail').textContent = 'Pega un JSON de regla Dynamo para convertirlo a texto.';
      importError.classList.add('visible');
      return;
    }

    try {
      let json;
      try {
        json = JSON.parse(input);
      } catch (_) {
        json = JSON.parse(this.extractFirstJson(input));
      }
      const text = dynamoJsonToText(json);
      this.importOutput.textContent = text;
      importSuccess.textContent = 'JSON convertido a texto correctamente';
      importSuccess.classList.add('visible');
    } catch (err) {
      importError.querySelector('.error-title').textContent = 'Error al procesar el JSON';
      importError.querySelector('.error-detail').textContent = err.message;
      importError.classList.add('visible');
    }
  }

  extractFirstJson(str) {
    const start = str.indexOf('{');
    if (start === -1) return str;
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < str.length; i++) {
      const ch = str[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return str.substring(start, i + 1); }
    }
    return str;
  }

  importValidate() {
    const input = this.importInput.value.trim();
    const container = document.getElementById('importValidationResults');
    container.innerHTML = '';

    if (!input) {
      this.showToast('Pega un JSON primero', 'error');
      return;
    }

    try {
      const json = JSON.parse(input);
      const errors = validateDynamoSchema(json);
      if (errors.length === 0) {
        container.innerHTML = `
          <div class="validation-item success">
            <span>&#10003;</span>
            <span>Esquema válido</span>
          </div>`;
      } else {
        errors.forEach(err => {
          container.innerHTML += `
            <div class="validation-item error">
              <span>&#10007;</span>
              <span class="path">${err.path}</span>
              <span>${err.message}</span>
            </div>`;
        });
      }
    } catch {
      container.innerHTML = `
        <div class="validation-item error">
          <span>&#10007;</span>
          <span>JSON inválido: error de sintaxis</span>
        </div>`;
    }
  }

  handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      this.importInput.value = ev.target.result;
      this.showToast('Archivo cargado', 'info');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ─── Builder ───

  initBuilder() {
    document.getElementById('btnAddCondition').addEventListener('click', () => this.addCondition());
    document.getElementById('btnBuilderGenerate').addEventListener('click', () => this.generateFromBuilder());
    document.getElementById('btnBuilderClear').addEventListener('click', () => this.clearBuilder());
    this.renderBuilder();
  }

  createEmptyCondition() {
    return { field: '', operator: 'EQUALS', value: '', id: Date.now() + Math.random() };
  }

  addCondition() {
    this.builderConditions.push(this.createEmptyCondition());
    this.renderBuilder();
  }

  removeCondition(index) {
    if (this.builderConditions.length <= 1) return;
    this.builderConditions.splice(index, 1);
    this.renderBuilder();
  }

  renderBuilder() {
    this.conditionsList.innerHTML = '';

    this.builderConditions.forEach((cond, i) => {
      if (i > 0) {
        const connector = document.createElement('div');
        connector.className = 'logical-connector';
        connector.innerHTML = `<button class="logical-badge" data-index="${i}">${this.builderLogicOp}</button>`;
        connector.querySelector('.logical-badge').addEventListener('click', () => {
          this.builderLogicOp = this.builderLogicOp === 'AND' ? 'OR' : 'AND';
          this.renderBuilder();
        });
        this.conditionsList.appendChild(connector);
      }

      const card = document.createElement('div');
      card.className = 'condition-card';
      card.innerHTML = `
        <div class="condition-card-header">
          <span class="condition-number">Condición ${i + 1}</span>
          ${this.builderConditions.length > 1
            ? `<button class="btn btn-sm btn-danger btn-remove" data-index="${i}">&#10005;</button>`
            : ''}
        </div>
        <div class="condition-fields">
          <div class="form-group">
            <label class="form-label">Campo</label>
            <input type="text" class="form-input builder-field" 
                   list="fieldSuggestions"
                   placeholder="payload.mensaje.envio..." 
                   value="${cond.field}" data-index="${i}">
          </div>
          <div class="condition-row">
            <div class="form-group">
              <label class="form-label">Operador</label>
              <select class="form-select builder-operator" data-index="${i}">
                <option value="EQUALS" ${cond.operator === 'EQUALS' ? 'selected' : ''}>=</option>
                <option value="NOT_EQUALS" ${cond.operator === 'NOT_EQUALS' ? 'selected' : ''}>!=</option>
                <option value="GREATER_THAN" ${cond.operator === 'GREATER_THAN' ? 'selected' : ''}>&gt;</option>
                <option value="LESS_THAN" ${cond.operator === 'LESS_THAN' ? 'selected' : ''}>&lt;</option>
                <option value="GREATER_THAN_OR_EQUALS" ${cond.operator === 'GREATER_THAN_OR_EQUALS' ? 'selected' : ''}>&gt;=</option>
                <option value="LESS_THAN_OR_EQUALS" ${cond.operator === 'LESS_THAN_OR_EQUALS' ? 'selected' : ''}>&lt;=</option>
                <option value="IN" ${cond.operator === 'IN' ? 'selected' : ''}>IN</option>
                <option value="NOT_IN" ${cond.operator === 'NOT_IN' ? 'selected' : ''}>NOT IN</option>
                <option value="CONTAINS" ${cond.operator === 'CONTAINS' ? 'selected' : ''}>CONTAINS</option>
                <option value="NOT_CONTAINS" ${cond.operator === 'NOT_CONTAINS' ? 'selected' : ''}>NOT CONTAINS</option>
              </select>
            </div>
            <span></span>
            <div class="form-group">
              <label class="form-label">Valor</label>
              <input type="text" class="form-input builder-value" 
                     placeholder="${cond.operator === 'IN' || cond.operator === 'NOT_IN' ? "'val1','val2'" : "'valor' o 123"}" 
                     value="${cond.value}" data-index="${i}">
            </div>
          </div>
        </div>`;

      const removeBtn = card.querySelector('.btn-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => this.removeCondition(i));
      }

      card.querySelector('.builder-field').addEventListener('input', (e) => {
        this.builderConditions[i].field = e.target.value;
      });
      card.querySelector('.builder-operator').addEventListener('change', (e) => {
        this.builderConditions[i].operator = e.target.value;
        this.renderBuilder();
      });
      card.querySelector('.builder-value').addEventListener('input', (e) => {
        this.builderConditions[i].value = e.target.value;
      });

      this.conditionsList.appendChild(card);
    });
  }

  generateFromBuilder() {
    const parts = [];
    const OP_SYMBOL = {
      EQUALS: '=', NOT_EQUALS: '!=', GREATER_THAN: '>',
      LESS_THAN: '<', GREATER_THAN_OR_EQUALS: '>=',
      LESS_THAN_OR_EQUALS: '<=', IN: 'IN', NOT_IN: 'NOT IN',
      CONTAINS: 'CONTAINS', NOT_CONTAINS: 'NOT CONTAINS',
    };

    for (const cond of this.builderConditions) {
      if (!cond.field || !cond.value) {
        this.showToast('Completa todos los campos de cada condición', 'error');
        return;
      }

      const field = cond.field;
      const op = OP_SYMBOL[cond.operator] || '=';
      let val = cond.value;

      if (cond.operator === 'IN' || cond.operator === 'NOT_IN') {
        const vals = val.split(',').map(v => v.trim());
        const formatted = vals.map(v => {
          if (/^\d+(\.\d+)?$/.test(v)) return v;
          const clean = v.replace(/^['"]|['"]$/g, '');
          return `'${clean}'`;
        }).join(', ');
        parts.push(`${field} ${op} (${formatted})`);
      } else {
        if (!/^\d+(\.\d+)?$/.test(val) && val !== 'true' && val !== 'false') {
          val = val.replace(/^['"]|['"]$/g, '');
          val = `'${val}'`;
        }
        parts.push(`${field} ${op} ${val}`);
      }
    }

    const ruleText = parts.join(` ${this.builderLogicOp} `);
    this.builderTextPreview.textContent = ruleText;

    try {
      const ast = parseRule(ruleText);
      const json = generateDynamoRule(ast);
      this.builderJsonPreview.innerHTML = this.highlightJson(JSON.stringify(json, null, 2));
      this.showToast('Regla generada desde el constructor', 'success');
    } catch (err) {
      this.builderJsonPreview.textContent = `Error: ${err.message}`;
    }
  }

  clearBuilder() {
    this.builderConditions = [this.createEmptyCondition()];
    this.builderLogicOp = 'AND';
    this.builderTextPreview.textContent = 'La expresión aparecerá aquí...';
    this.builderJsonPreview.innerHTML = '<div class="json-placeholder">El JSON aparecerá aquí</div>';
    this.renderBuilder();
  }

  // ─── History ───

  initHistory() {
    document.getElementById('btnClearHistory').addEventListener('click', () => {
      localStorage.removeItem(HISTORY_KEY);
      this.renderHistory();
      this.showToast('Historial limpiado', 'info');
    });
  }

  saveToHistory(ruleText, json) {
    const history = this.getHistory();
    history.unshift({
      id: Date.now(),
      ruleText,
      json,
      date: new Date().toISOString(),
    });
    if (history.length > MAX_HISTORY) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  renderHistory() {
    const history = this.getHistory();
    if (history.length === 0) {
      this.historyList.innerHTML = `
        <div class="history-empty">
          <div class="empty-icon">&#128196;</div>
          <p>No hay reglas en el historial</p>
          <p class="text-xs text-muted mt-2">Las reglas convertidas se guardarán aquí automáticamente</p>
        </div>`;
      return;
    }

    this.historyList.innerHTML = history.map(item => {
      const date = new Date(item.date);
      const dateStr = date.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      return `
        <div class="history-item" data-id="${item.id}">
          <div class="history-item-header">
            <span class="history-item-date">${dateStr}</span>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-secondary btn-history-use" data-id="${item.id}">Usar</button>
              <button class="btn btn-sm btn-danger btn-history-delete" data-id="${item.id}">&#10005;</button>
            </div>
          </div>
          <div class="history-item-rule">${this.escapeHtml(item.ruleText)}</div>
        </div>`;
    }).join('');

    this.historyList.querySelectorAll('.btn-history-use').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = history.find(h => h.id === parseInt(btn.dataset.id));
        if (item) {
          this.ruleInput.value = item.ruleText;
          this.tabs[0].click();
          this.convert();
        }
      });
    });

    this.historyList.querySelectorAll('.btn-history-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const updated = history.filter(h => h.id !== parseInt(btn.dataset.id));
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        this.renderHistory();
        this.showToast('Entrada eliminada', 'info');
      });
    });
  }

  // ─── UI Helpers ───

  showError(title, detail, before, highlight, after) {
    this.errorBox.classList.add('visible');
    this.errorBox.querySelector('.error-title').textContent = title;
    this.errorBox.querySelector('.error-detail').textContent = detail || '';
    this.ruleInput.classList.add('error');

    const indicator = this.errorBox.querySelector('.error-indicator');
    if (before !== undefined && highlight !== undefined) {
      indicator.innerHTML = `${this.escapeHtml(before)}<span class="error-highlight">${this.escapeHtml(highlight || ' ')}</span>${this.escapeHtml(after || '')}`;
      indicator.style.display = 'block';
    } else {
      indicator.style.display = 'none';
    }
  }

  hideError() {
    this.errorBox.classList.remove('visible');
    this.ruleInput.classList.remove('error');
  }

  showSuccess(message) {
    this.successBox.textContent = message;
    this.successBox.classList.add('visible');
  }

  hideSuccess() {
    this.successBox.classList.remove('visible');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '&#10003;', error: '&#10007;', info: '&#8505;' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${this.escapeHtml(message)}`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
