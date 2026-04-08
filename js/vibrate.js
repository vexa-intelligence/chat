(function () {
    if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return;

    const s = document.createElement('input');
    s.type = 'checkbox';
    s.setAttribute('switch', '');
    s.setAttribute('aria-hidden', 'true');
    s.tabIndex = -1;
    s.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(s);

    const l = document.createElement('label');
    l.htmlFor = s.id = '__hx';
    l.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none;';
    document.body.appendChild(l);

    const haptic = () => l.click();

    const SELECTOR = [
        'a[href]', 'button', 'input', 'select', 'textarea', 'label', 'summary',
        '[role="button"],[role="link"],[role="menuitem"],[role="menuitemcheckbox"]',
        '[role="menuitemradio"],[role="option"],[role="tab"],[role="treeitem"]',
        '[role="gridcell"],[role="switch"],[role="checkbox"],[role="radio"]',
        '[role="slider"],[role="spinbutton"],[role="combobox"],[role="listbox"]',
        '[tabindex],[onclick],[data-action],[data-href],[data-toggle]',
        '[data-dismiss],[data-target],[contenteditable]',
    ].join(',');

    const hasClick = new WeakSet();
    const _ael = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
        if (type === 'click') hasClick.add(this);
        return _ael.call(this, type, fn, opts);
    };

    const isInteractive = (el) =>
        el && (
            el.closest('#navbarInlineSearch') ||
                el.closest('#source-dropdown-wrapper') ||
                el.closest('.custom-select-wrapper') ||
                el.closest('[role="listbox"]') ||
                el.closest('[role="combobox"]') ||
                el.closest('select') ||
                (el.tagName === 'INPUT' && ['text', 'password', 'email', 'search', 'tel', 'url', 'number'].includes(el.type)) ||
                el.tagName === 'TEXTAREA'
                ? false
                : (
                    el.closest(SELECTOR) ||
                    hasClick.has(el) ||
                    typeof el.onclick === 'function' ||
                    el.hasAttribute('onclick') ||
                    !el.closest('[data-ai-toggle="true"]')
                )
        );

    document.addEventListener('click', (e) => {
        if (isInteractive(e.target)) haptic();
    }, true);

    document.addEventListener('change', (e) => {
        if (isInteractive(e.target)) haptic();
    }, true);

    document.addEventListener('input', (e) => {
        if (e.target.type === 'range') haptic();
    }, true);

    document.addEventListener('contextmenu', haptic, true);
})();