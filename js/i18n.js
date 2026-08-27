/* User-visible strings. English is the fallback; keys are referenced through
 * t(key) in js or data-i18n attributes in the HTML -- never hardcoded text. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.I18N = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var L = {
    en: {
      'app.title': 'ECU map viewer',
      'app.subtitle': 'IAW5AM calibration surfaces',
      'files.add': 'Add firmware',
      'files.hint': 'Drop a .bin and its .xdf here. Both files need the same name.',
      'files.browse': 'Choose files',
      'files.paired': 'Loaded {name}',
      'files.unpaired_bin': '{name}.bin has no {name}.xdf — pick a preset in the list',
      'files.unpaired_xdf': '{name}.xdf is waiting for {name}.bin',
      'files.bad_xdf': 'Cannot read {name}.xdf: {err}',
      'files.duplicate': '{name} is already loaded',
      'files.none': 'No firmware loaded yet.',
      'ds.name': 'Display name',
      'ds.remove': 'Remove',
      'ds.preset': 'Definition',
      'ds.preset_none': 'Pick a platform…',
      'ds.no_table': 'This map is not in the definition',
      'ds.base_badge': 'baseline',
      'role.ign_main': 'Ignition — main',
      'role.ign_delta': 'Ignition — delta',
      'role.fuel_main': 'Fuel — main',
      'role.fuel_delta': 'Fuel — delta',
      'ds.read_error': 'Read failed: {err}',
      'ds.visible': 'Show on the plot',
      'table.label': 'Map',
      'table.group_role': 'Same map across platforms',
      'table.group3d': 'Surfaces (3D)',
      'table.group2d': 'Curves (1D)',
      'table.count': '{have}/{total}',
      'table.none': 'Load a firmware to pick a map.',
      'view.surface': 'Surfaces',
      'view.diff': 'Difference',
      'view.base': 'Baseline',
      'view.contours': 'Contours',
      'view.opacity': 'Opacity',
      'view.reset': 'Reset view',
      'view.png': 'PNG',
      'slice.label': 'Cross-section',
      'slice.off': 'Off',
      'slice.rpm': 'At fixed RPM',
      'slice.tps': 'At fixed TPS',
      'slice.value': 'Value',
      'axis.rpm': 'RPM',
      'axis.tps': 'TPS, °',
      'axis.value': 'Value',
      'axis.advance': 'Advance, °',
      'axis.breakpoint': 'Axis point',
      'axis.delta': 'Δ vs {name}',
      'plot.empty': 'Nothing to show. Load a firmware and tick it in the list.',
      'plot.diff_need_base': 'Difference mode needs a baseline plus one more map.',
      'stat.range': '{min} … {max}',
      'stat.cells': '{rows}×{cols} cells at {addr}',
      'lang': 'Русский',
      'theme.dark': 'Dark',
      'theme.light': 'Light'
    },
    ru: {
      'app.title': 'Просмотрщик карт ЭБУ',
      'app.subtitle': 'Калибровочные поверхности IAW5AM',
      'files.add': 'Добавить прошивку',
      'files.hint': 'Перетащите .bin и его .xdf. Имена файлов должны совпадать.',
      'files.browse': 'Выбрать файлы',
      'files.paired': 'Загружено: {name}',
      'files.unpaired_bin': 'Для {name}.bin нет {name}.xdf — выберите пресет в списке',
      'files.unpaired_xdf': '{name}.xdf ждёт {name}.bin',
      'files.bad_xdf': 'Не читается {name}.xdf: {err}',
      'files.duplicate': '{name} уже загружен',
      'files.none': 'Прошивки не загружены.',
      'ds.name': 'Отображаемое имя',
      'ds.remove': 'Убрать',
      'ds.preset': 'Описание',
      'ds.preset_none': 'Выберите платформу…',
      'ds.no_table': 'Этой карты нет в описании',
      'ds.base_badge': 'база',
      'role.ign_main': 'Зажигание — основная',
      'role.ign_delta': 'Зажигание — дельта',
      'role.fuel_main': 'Топливо — основная',
      'role.fuel_delta': 'Топливо — дельта',
      'ds.read_error': 'Ошибка чтения: {err}',
      'ds.visible': 'Показывать на графике',
      'table.label': 'Карта',
      'table.group_role': 'Одна карта на разных платформах',
      'table.group3d': 'Поверхности (3D)',
      'table.group2d': 'Кривые (1D)',
      'table.count': '{have}/{total}',
      'table.none': 'Загрузите прошивку, чтобы выбрать карту.',
      'view.surface': 'Поверхности',
      'view.diff': 'Разница',
      'view.base': 'База',
      'view.contours': 'Контуры',
      'view.opacity': 'Прозрачность',
      'view.reset': 'Сбросить вид',
      'view.png': 'PNG',
      'slice.label': 'Сечение',
      'slice.off': 'Выкл',
      'slice.rpm': 'При фикс. оборотах',
      'slice.tps': 'При фикс. TPS',
      'slice.value': 'Значение',
      'axis.rpm': 'Обороты, об/мин',
      'axis.tps': 'ДПДЗ, °',
      'axis.value': 'Значение',
      'axis.advance': 'УОЗ, °',
      'axis.breakpoint': 'Точка оси',
      'axis.delta': 'Δ к «{name}»',
      'plot.empty': 'Нечего показывать. Загрузите прошивку и отметьте её в списке.',
      'plot.diff_need_base': 'Для режима разницы нужны база и ещё одна карта.',
      'stat.range': '{min} … {max}',
      'stat.cells': '{rows}×{cols} ячеек по адресу {addr}',
      'lang': 'English',
      'theme.dark': 'Тёмная',
      'theme.light': 'Светлая'
    }
  };

  var current = 'ru';

  function setLang(lang) { if (L[lang]) current = lang; return current; }
  function getLang() { return current; }

  function t(key, vars) {
    var s = (L[current] && L[current][key]) || L.en[key] || key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) {
        return vars[k] === undefined ? m : String(vars[k]);
      });
    }
    return s;
  }

  return { t: t, setLang: setLang, getLang: getLang, locales: L };
});
