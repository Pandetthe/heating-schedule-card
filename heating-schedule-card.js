/* heating-schedule-card - edycja temperatur w harmonogramach grzania suwakiem.
   Czyta i zapisuje pomocniki `schedule` przez websocket HA. */

const DNI = [
  ["monday", "pn", "Poniedziałek"], ["tuesday", "wt", "Wtorek"],
  ["wednesday", "śr", "Środa"], ["thursday", "cz", "Czwartek"],
  ["friday", "pt", "Piątek"], ["saturday", "sb", "Sobota"],
  ["sunday", "nd", "Niedziela"],
];

const hhmm = (s) => (s || "00:00:00").slice(0, 5);
const pelna = (s) => (s.length === 5 ? s + ":00" : s);
const naMinuty = (s) => {
  const [h, m] = hhmm(s).split(":").map(Number);
  return h * 60 + m;
};

/* Wybiera pierwszy zarejestrowany komponent z listy preferencji.
   Dzieki temu karta korzysta z natywnych elementow HA tam, gdzie sa dostepne,
   a na starszych/nowszych wersjach schodzi do prostszego wariantu zamiast sie wysypac. */
const dostepny = (...nazwy) => nazwy.find((n) => customElements.get(n)) || null;

function przyciskHA(tekst, { glowny = false, ikona = null } = {}) {
  const tag = dostepny("ha-button", "mwc-button");
  if (tag) {
    const el = document.createElement(tag);
    // Atrybuty ustawiamy dla obu rodzin komponentow - nieznane sa ignorowane,
    // wiec przycisk wychodzi wypelniony niezaleznie od wersji frontendu HA.
    if (glowny) {
      el.setAttribute("unelevated", "");        // mwc-button: wypelniony
      el.setAttribute("raised", "");
      el.setAttribute("appearance", "filled");  // ha-button (Material 3)
      el.setAttribute("variant", "brand");
    } else {
      // Drugorzedne akcje w HA sa "ghost" - plaskie, bez obrysu.
      el.setAttribute("appearance", "plain");
      el.setAttribute("variant", "brand");
    }
    el.textContent = tekst;
    if (ikona) {
      const i = document.createElement("ha-icon");
      i.setAttribute("icon", ikona);
      i.slot = "icon";
      el.prepend(i);
    }
    return el;
  }
  const el = document.createElement("button");
  el.className = glowny ? "zapasowy glowny" : "zapasowy";
  el.textContent = tekst;
  return el;
}

function ikonaHA(icon, etykieta) {
  const tag = dostepny("ha-icon-button");
  if (tag) {
    const el = document.createElement(tag);
    // ha-icon-button sam pokazuje etykiete jako podpowiedz, jak w calym HA.
    el.setAttribute("label", etykieta);
    const i = document.createElement("ha-icon");
    i.setAttribute("icon", icon);
    el.appendChild(i);
    return el;
  }
  const el = document.createElement("button");
  el.className = "zapasowy ikonka";
  el.title = etykieta;
  el.setAttribute("aria-label", etykieta);
  el.textContent = "\u2715";
  return el;
}

/* Format 12/24 h jak w profilu HA (hass.locale.time_format), a nie jak w
   przegladarce - natywny input type=time bierze format z jezyka przegladarki. */
function zegar12(hass) {
  const l = (hass && hass.locale) || {};
  if (l.time_format === "12") return true;
  if (l.time_format === "24") return false;
  const jezyk = l.time_format === "system" ? undefined : (l.language || hass?.language);
  return !!new Intl.DateTimeFormat(jezyk, { hour: "numeric" }).resolvedOptions().hour12;
}

const dwa = (n) => String(n).padStart(2, "0");

/* Liczby jak w HA (hass.locale.number_format), np. "20,0" po polsku - tak samo
   jak wartosci suwakow input_number obok karty. */
const JEZYK_FORMATU = { comma_decimal: "en-US", decimal_comma: "de", space_comma: "fr" };
function formatLiczby(hass) {
  const l = (hass && hass.locale) || {};
  const jezyk = l.number_format === "system" ? undefined
    : JEZYK_FORMATU[l.number_format] || l.language || hass?.language;
  const f = new Intl.NumberFormat(jezyk, {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
    useGrouping: l.number_format !== "none",
  });
  return (n) => f.format(Number(n));
}

/* Pole czasu na wzor ha-time-input z HA (ten komponent nie jest dostepny dla
   kart wlasnych): osobne pola godzin i minut, tylko cyfry, strzalki zmieniaja
   wartosc, AM/PM tylko w trybie 12 h. Zmiana trafia do naZmiane dopiero, gdy
   fokus opusci cala kontrolke - przerysowanie karty w trakcie przechodzenia
   z godzin do minut zgubiloby fokus. */
function polCzasu(wartosc, h12, naZmiane) {
  let [h24, min] = hhmm(wartosc).split(":").map(Number);
  const el = document.createElement("span");
  el.className = "czas";

  const pole = (etykieta) => {
    const i = document.createElement("input");
    i.type = "text";
    i.inputMode = "numeric";
    i.maxLength = 2;
    i.autocomplete = "off";
    i.setAttribute("aria-label", etykieta);
    i.addEventListener("focus", () => i.select());
    return i;
  };
  const poleH = pole("Godzina"), poleM = pole("Minuty");
  const dwukropek = document.createElement("span");
  dwukropek.className = "dwukropek";
  dwukropek.textContent = ":";
  el.append(poleH, dwukropek, poleM);

  let pora = null;
  if (h12) {
    pora = document.createElement("button");
    pora.type = "button";
    pora.className = "pora";
    pora.addEventListener("click", () => {
      h24 = (h24 + 12) % 24;
      pokaz();
    });
    el.append(pora);
  }

  const pokaz = () => {
    poleH.value = h12 ? String(h24 % 12 || 12) : dwa(h24);
    poleM.value = dwa(min);
    if (pora) pora.textContent = h24 >= 12 ? "PM" : "AM";
  };
  // Wpis w polu godzin -> h24 (w trybie 12 h z zachowaniem AM/PM).
  const zGodzin = (n) => (h12 ? (n % 12) + (h24 >= 12 ? 12 : 0) : n);
  const czytaj = () => {
    const n = parseInt(poleH.value, 10);
    if (!Number.isNaN(n)) h24 = h12 ? zGodzin(Math.min(Math.max(n, 1), 12)) : Math.min(n, 23);
    const m = parseInt(poleM.value, 10);
    if (!Number.isNaN(m)) min = Math.min(m, 59);
  };

  [[poleH, "h"], [poleM, "m"]].forEach(([i, rodzaj]) => {
    i.addEventListener("input", () => {
      i.value = i.value.replace(/\D/g, "").slice(0, 2);
      // Po pelnej godzinie przeskok do minut (jak w zegarku HA).
      const prog = h12 ? 1 : 2;
      if (rodzaj === "h" && (i.value.length === 2 || Number(i.value) > prog)) {
        poleM.focus();
      }
    });
    i.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        ev.preventDefault();
        czytaj();
        const d = ev.key === "ArrowUp" ? 1 : -1;
        if (rodzaj === "h") h24 = (h24 + d + 24) % 24;
        else min = (min + d * 5 + 60) % 60;
        pokaz();
        i.select();
      } else if (ev.key === "Enter") {
        i.blur();
      }
    });
  });

  let start = `${dwa(h24)}:${dwa(min)}`;
  el.addEventListener("focusout", (ev) => {
    if (el.contains(ev.relatedTarget)) return;
    czytaj();
    pokaz();
    const nowa = `${dwa(h24)}:${dwa(min)}`;
    if (nowa !== start) {
      start = nowa;
      naZmiane(nowa);
    }
  });

  pokaz();
  return el;
}

/* Ruch w stylu HA: rozwija/zwija sam zmieniany element (wysokosc, marginesy,
   przezroczystosc), a to, co pod nim, plynnie sie przesuwa - bez obcinania
   calej karty. Krzywa i czas jak w animacjach Material w HA. */
const RUCH = { duration: 250, easing: "cubic-bezier(.4,0,.2,1)" };
const bezRuchu = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function wymiary(el) {
  const cs = getComputedStyle(el);
  return { height: `${el.getBoundingClientRect().height}px`, marginTop: cs.marginTop,
    marginBottom: cs.marginBottom, opacity: 1 };
}
const ZERO = { height: "0px", marginTop: "0px", marginBottom: "0px", opacity: 0 };
function rozwin(el) {
  if (!el || bezRuchu()) return;
  el.style.overflow = "hidden";
  const a = el.animate([ZERO, wymiary(el)], RUCH);
  a.onfinish = a.oncancel = () => { el.style.overflow = ""; };
}
function zwin(el, potem) {
  if (!el || bezRuchu()) return potem();
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  const a = el.animate([wymiary(el), ZERO], { ...RUCH, duration: 200, fill: "forwards" });
  a.onfinish = potem;
}

/* Schowek wspolny dla wszystkich kart na stronie: skopiowane bloki mozna wkleic
   w dowolnej grupie dni tej samej karty albo w harmonogramie innego pokoju.
   Jak zwykly schowek: zostaje do kolejnego skopiowania (albo przeladowania strony). */
let schowek = null;   // { schedule, nazwa, etykieta, dni: [...], bloki: [...] }
const karty = new Set();
function ustawSchowek(wartosc) {
  schowek = wartosc;
  for (const k of karty) k._render();
}

class HeatingScheduleCard extends HTMLElement {
  connectedCallback() {
    karty.add(this);
    if (this._karta) this._render();
  }

  disconnectedCallback() {
    karty.delete(this);
  }

  setConfig(config) {
    if (!config || !config.entity || !config.entity.startsWith("schedule.")) {
      throw new Error("Wymagane: entity wskazujące na encję schedule.*");
    }
    // min/max/step domyslnie z termostatow pokoju (patrz _limity); w konfiguracji
    // mozna je nadpisac recznie.
    this._config = { unit: "°C", grupuj_dni: false, ...config };
    this._scheduleId = config.entity.split(".")[1];
    this._dane = null;       // { name, icon, dni: {dzien: [bloki]} }
    this._brudne = false;
    this._blad = null;
    this._zapisywanie = false;
    // Ktore dni sa rozwiniete. Domyslnie tylko dzisiejszy, zeby karta nie
    // rozlewala sie na siedem dni naraz.
    this._rozwiniete = new Set([DNI[(new Date().getDay() + 6) % 7][0]]);
  }

  set hass(hass) {
    const pierwszy = !this._hass;
    this._hass = hass;
    // Karta zalezy wylacznie od konfiguracji harmonogramu (pobieranej przez WS),
    // a nie od stanow encji. Przerysowanie przy kazdej zmianie hass przerywaloby
    // przeciaganie suwaka, wiec renderujemy tylko po pobraniu i po akcji uzytkownika.
    if (pierwszy) this._pobierz();
  }

  getCardSize() {
    return this._dane ? 3 + Object.keys(this._dane.dni).length * 2 : 4;
  }

  static getStubConfig() {
    return { entity: "schedule.grzanie_salon" };
  }

  /* Termostaty pokoju: `termostat` z konfiguracji (encja lub lista), inaczej
     wszystkie climate.<pokoj>_* dla schedule.grzanie_<pokoj>. */
  _termostaty() {
    const t = this._config.termostat;
    if (t) return Array.isArray(t) ? t : [t];
    const pokoj = this._scheduleId.replace(/^grzanie_/, "");
    return Object.keys(this._hass.states).filter((e) => e.startsWith(`climate.${pokoj}_`));
  }

  /* Zakres suwaka taki jak w termostacie: przy kilku glowicach czesc wspolna
     zakresow; krok jak w karcie termostatu HA (target_temp_step, inaczej 0,5). */
  _limity() {
    const atr = this._termostaty()
      .map((e) => this._hass.states[e])
      .filter(Boolean)
      .map((s) => s.attributes);
    const z = (klucz, f, domyslna) => {
      const w = atr.map((a) => Number(a[klucz])).filter((x) => Number.isFinite(x) && x > 0);
      return w.length ? f(...w) : domyslna;
    };
    return {
      min: Number(this._config.min ?? z("min_temp", Math.max, 7)),
      max: Number(this._config.max ?? z("max_temp", Math.min, 30)),
      step: Number(this._config.step ?? z("target_temp_step", Math.max, 0.5)),
    };
  }

  async _pobierz() {
    try {
      const lista = await this._hass.callWS({ type: "schedule/list" });
      const s = lista.find((x) => x.id === this._scheduleId);
      if (!s) throw new Error(`Nie znaleziono harmonogramu „${this._scheduleId}”`);
      const dni = {};
      for (const [klucz] of DNI) {
        dni[klucz] = (s[klucz] || []).map((b) => ({
          from: hhmm(b.from),
          to: hhmm(b.to),
          temp: Number((b.data || {}).temperatura ?? this._limity().min),
          brakTemp: (b.data || {}).temperatura === undefined || (b.data || {}).temperatura === "",
        }));
      }
      this._dane = { name: s.name, icon: s.icon, dni };
      this._uklad = this._ukladGrup();
      this._oryginal = this._sygnatura();
      this._blad = null;
    } catch (e) {
      this._blad = e.message || String(e);
    }
    this._render();
  }

  /* Uklad grup liczony przy wczytaniu: przy grupuj_dni:true razem trafiaja
     wszystkie dni o identycznych blokach (takze niesasiednie, np. pn, wt, cz, pt
     + osobno sr). Potem uklad jest stanem edycji - zmiana blokow nie przetasowuje
     grup w trakcie, a dni przenosi sie chipami (_przelaczDzien). */
  _ukladGrup() {
    if (!this._config.grupuj_dni) return DNI.map(([k]) => [k]);
    const sygn = (d) =>
      JSON.stringify(this._dane.dni[d].map((b) => [b.from, b.to, b.temp]));
    const wg = new Map();
    for (const [k] of DNI) {
      const s = sygn(k);
      if (!wg.has(s)) wg.set(s, []);
      wg.get(s).push(k);
    }
    return [...wg.values()];
  }

  /* Stan blokow wszystkich dni w postaci porownywalnej (posortowane, bez pol
     pomocniczych) - do sprawdzania, czy cos sie realnie zmienilo. */
  _sygnatura() {
    return JSON.stringify(DNI.map(([k]) => [...this._dane.dni[k]]
      .sort((a, b) => naMinuty(a.from) - naMinuty(b.from))
      .map((b) => [b.from, b.to, Number(b.temp)])));
  }

  _grupy() {
    const indeks = (k) => DNI.findIndex(([d]) => d === k);
    return this._uklad
      .map((dni) => [...dni].sort((a, b) => indeks(a) - indeks(b)))
      .sort((a, b) => indeks(a[0]) - indeks(b[0]))
      .map((dni) => ({
        dni,
        skroty: dni.map((k) => DNI[indeks(k)][1]),
        pelna: this._config.grupuj_dni ? null : DNI[indeks(dni[0])][2],
      }));
  }

  /* Ciag dni jako "a–b" (takze dwa dni: "sb–nd"), przecinki tylko miedzy
     rozrzuconymi kawalkami: "pn–wt, cz–pt", "pn, śr, pt"; caly tydzien = "codziennie". */
  _etykieta(g) {
    if (g.pelna) return g.pelna;
    if (g.dni.length === 7) return "codziennie";
    const idx = g.dni.map((k) => DNI.findIndex(([d]) => d === k));
    const czesci = [];
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
      const dl = j - i + 1;
      czesci.push(dl >= 2 ? `${DNI[idx[i]][1]}–${DNI[idx[j]][1]}` : DNI[idx[i]][1]);
      i = j + 1;
    }
    return czesci.join(", ");
  }

  /* Chip dnia w rozwinietej grupie: dzien z grupy -> odlacza go do osobnej grupy
     (z tymi samymi blokami, gotowej do zmiany); dzien spoza grupy -> dolacza go
     i kopiuje mu bloki grupy. */
  _przelaczDzien(grupa, dzien) {
    const zrodlo = this._uklad.find((u) => u.includes(dzien));
    if (grupa.dni.includes(dzien)) {
      if (grupa.dni.length === 1) return;
      zrodlo.splice(zrodlo.indexOf(dzien), 1);
      this._uklad.push([dzien]);
      this._nowaGrupa = dzien;
    } else {
      zrodlo.splice(zrodlo.indexOf(dzien), 1);
      if (!zrodlo.length) this._uklad.splice(this._uklad.indexOf(zrodlo), 1);
      this._uklad.find((u) => u.includes(grupa.dni[0])).push(dzien);
      this._dane.dni[dzien] = this._dane.dni[grupa.dni[0]].map((b) => ({ ...b }));
      this._brudne = true;
    }
    // Obie grupy (stara i nowa) zostaja rozwiniete, zeby bylo widac efekt.
    this._rozwiniete.add(dzien);
    for (const k of zrodlo) this._rozwiniete.add(k);
    for (const k of grupa.dni) this._rozwiniete.add(k);
    this._render();
  }

  _blediWalidacji() {
    const b = [];
    for (const [klucz, skrot] of DNI) {
      const bloki = [...this._dane.dni[klucz]].sort(
        (x, y) => naMinuty(x.from) - naMinuty(y.from)
      );
      for (let i = 0; i < bloki.length; i++) {
        if (naMinuty(bloki[i].to) <= naMinuty(bloki[i].from))
          b.push(`${skrot}: blok ${bloki[i].from}-${bloki[i].to} kończy się przed startem`);
        if (i > 0 && naMinuty(bloki[i].from) < naMinuty(bloki[i - 1].to))
          b.push(`${skrot}: bloki ${bloki[i - 1].from}-${bloki[i - 1].to} i ${bloki[i].from}-${bloki[i].to} nachodzą na siebie`);
      }
    }
    return b;
  }

  _zmien(grupa, idx, pole, wartosc) {
    for (const d of grupa.dni) {
      const blok = this._dane.dni[d][idx];
      if (!blok) continue;
      blok[pole] = wartosc;
      if (pole === "temp") blok.brakTemp = false;
    }
    // Zmiana wartosci (temperatura, godzina) nie zmienia ukladu karty - bez
    // przebudowy DOM: tylko podsumowania dni, bledy i pasek zapisu. Dzieki temu
    // nic nie skacze i fokus zostaje w polach.
    this._odswiezStan();
  }

  /* "1 blok · 23,0 °C" w naglowku grupy. */
  /* Bledy walidacji i pasek zapisu - osobno od reszty karty, zeby zmiana wartosci
     odswiezala tylko ten fragment. */
  _renderStopka() {
    const mBledow = this._body.querySelector(".miejsce-bledow");
    const mPaska = this._body.querySelector(".miejsce-paska");
    if (!mBledow || !mPaska) return;
    const bledy = this._blediWalidacji();
    this._brudne = this._sygnatura() !== this._oryginal;

    let hBledow = "";
    if (bledy.length) hBledow += `<div class="blad">${bledy.map((x) => `• ${x}`).join("<br>")}</div>`;
    if (this._blad) hBledow += `<div class="blad">${this._blad}</div>`;
    if (hBledow !== this._hBledow) {
      const bylo = !!this._hBledow;
      this._hBledow = hBledow;
      if (!hBledow && bylo && mBledow.firstElementChild) {
        zwin(mBledow, () => { mBledow.innerHTML = this._hBledow; mBledow.getAnimations().forEach((a) => a.cancel()); mBledow.style.cssText = ""; });
      } else {
        mBledow.getAnimations().forEach((a) => a.cancel());
        mBledow.style.cssText = "";
        mBledow.innerHTML = hBledow;
        if (!bylo) rozwin(mBledow);
      }
    }

    // Pasek zapisu tylko wtedy, gdy jest co zapisac (albo trwa/skonczyl sie zapis).
    const doZapisu = this._brudne && !bledy.length && !this._zapisywanie;
    const stopka = this._brudne || this._zapisywanie || this._zapisano;
    const pokazac = stopka && !mPaska.firstElementChild;
    const schowac = !stopka && mPaska.firstElementChild;
    this._stopkaWidoczna = stopka;
    if (schowac) {
      zwin(mPaska, () => {
        if (this._brudne || this._zapisywanie || this._zapisano) return;
        mPaska.innerHTML = "";
        mPaska.getAnimations().forEach((a) => a.cancel());
        mPaska.style.cssText = "";
      });
      return;
    }
    if (!stopka) return;
    mPaska.getAnimations().forEach((a) => a.cancel());
    mPaska.style.cssText = "";
    mPaska.innerHTML = `<div class="stopka${doZapisu ? " zmiany" : ""}">
        <span class="stan">${
          this._zapisywanie ? "Zapisywanie…"
          : bledy.length ? "Popraw błędy, żeby zapisać"
          : this._brudne ? "Masz niezapisane zmiany"
          : "Zapisano"
        }</span>
        <span class="przyciski">${this._brudne && !this._zapisywanie ? `<span class="slot-odrzuc"></span>` : ""}${this._brudne || this._zapisywanie ? `<span class="slot-zapisz"></span>` : ""}</span>
      </div>`;
    const slotZ = mPaska.querySelector(".slot-zapisz");
    if (slotZ) {
      const el = przyciskHA("Zapisz zmiany", { glowny: true });
      const zablokowany = !this._brudne || bledy.length > 0 || this._zapisywanie;
      el.disabled = zablokowany;
      if (zablokowany) el.setAttribute("disabled", "");
      el.addEventListener("click", () => this._zapisz());
      slotZ.replaceWith(el);
    }
    const slotO = mPaska.querySelector(".slot-odrzuc");
    if (slotO) {
      const el = przyciskHA("Odrzuć");
      el.addEventListener("click", () => this._odrzuc());
      slotO.replaceWith(el);
    }
    if (pokazac) rozwin(mPaska);
  }


  /* Przy pelnym przerysowaniu pasek, ktory juz byl widoczny, nie wysuwa sie od nowa. */
  _renderStopkaPoRysowaniu() {
    const bylWidoczny = this._stopkaWidoczna;
    this._renderStopka();
    const mPaska = this._body.querySelector(".miejsce-paska");
    if (bylWidoczny && mPaska) mPaska.getAnimations().forEach((a) => a.finish());
  }

  _podsumowanie(g) {
    const fmt = formatLiczby(this._hass);
    const { unit } = this._config;
    const bloki = this._dane.dni[g.dni[0]];
    const t = bloki.map((b) => Number(b.temp));
    const n = bloki.length;
    const ile = n === 0 ? "brak bloków" : n === 1 ? "1 blok" : n < 5 ? `${n} bloki` : `${n} bloków`;
    if (!n) return ile;
    const lo = Math.min(...t), hi = Math.max(...t);
    return `${ile} · ${lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`} ${unit}`;
  }

  _odswiezStan() {
    this._grupy().forEach((g, gi) => {
      const el = this._body.querySelector(`.grupa[data-g="${gi}"] .podsumowanie`);
      if (el) el.textContent = this._podsumowanie(g);
    });
    this._renderStopka();
  }




  _usun(grupa, idx) {
    for (const d of grupa.dni) this._dane.dni[d].splice(idx, 1);
    this._brudne = true;
    this._render();
  }

  /* Znajduje wolna luke w dobie (min. 30 min), zeby nowy blok nie nachodzil
     na istniejace. Preferuje luke po ostatnim bloku, inaczej najszersza. */
  _wolnaLuka(bloki) {
    const MIN = 30, DOBA = 24 * 60 - 1;
    const sort = [...bloki].sort((a, b) => naMinuty(a.from) - naMinuty(b.from));
    const luki = [];
    let kursor = 0;
    for (const b of sort) {
      const s = naMinuty(b.from);
      if (s - kursor >= MIN) luki.push([kursor, s]);
      kursor = Math.max(kursor, naMinuty(b.to));
    }
    if (DOBA - kursor >= MIN) luki.push([kursor, DOBA]);
    if (!luki.length) return null;
    const poOstatnim = luki[luki.length - 1][1] === DOBA ? luki[luki.length - 1] : null;
    const najszersza = luki.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), luki[0]);
    const [od, doo] = poOstatnim || najszersza;
    return [od, Math.min(od + 120, doo)];
  }

  _dodaj(grupa) {
    const wzor = this._wolnaLuka(this._dane.dni[grupa.dni[0]]);
    if (!wzor) {
      this._blad = "Brak wolnego miejsca w dobie - usuń lub skróć istniejący blok.";
      this._render();
      return;
    }
    const fmt = (m) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const [od, doo] = wzor;
    for (const d of grupa.dni) {
      this._dane.dni[d].push({ from: fmt(od), to: fmt(doo), temp: 21, brakTemp: false });
      this._dane.dni[d].sort((a, b) => naMinuty(a.from) - naMinuty(b.from));
    }
    // Zapamietujemy, ktory wiersz jest nowy, zeby go wyroznic animacja wejscia.
    this._nowy = { dzien: grupa.dni[0], from: fmt(od) };
    this._blad = null;
    this._brudne = true;
    this._render();
  }

  _kopiuj(grupa) {
    ustawSchowek({
      schedule: this._scheduleId,
      nazwa: this._nazwaPokoju(),
      etykieta: this._etykieta(grupa),
      dni: [...grupa.dni],
      bloki: this._dane.dni[grupa.dni[0]].map((b) => ({ ...b })),
    });
  }

  /* Nazwa do opisu schowka: obszar harmonogramu w HA (Salon, Łazienka...),
     bo same harmonogramy nazywaja sie tak samo ("Grzanie"). */
  _nazwaPokoju() {
    const h = this._hass || {};
    const e = h.entities?.[this._config.entity];
    const obszar = e?.area_id || (e?.device_id && h.devices?.[e.device_id]?.area_id);
    return (obszar && h.areas?.[obszar]?.name) || this._dane.name || this._scheduleId;
  }

  _zrodloSchowka(grupa) {
    return !!schowek && schowek.schedule === this._scheduleId
      && schowek.dni.length === grupa.dni.length && grupa.dni.every((d) => schowek.dni.includes(d));
  }

  /* Wkleja bloki ze schowka do wszystkich dni grupy (zastepuje ich bloki).
     Temperatury dopasowane do zakresu i kroku termostatow tego pokoju. */
  _wklej(grupa) {
    if (!schowek) return;
    const { min, max, step } = this._limity();
    const dopasuj = (v) => Math.min(max, Math.max(min, Math.round(Number(v) / step) * step));
    for (const d of grupa.dni) {
      this._dane.dni[d] = schowek.bloki.map((b) => ({ ...b, temp: dopasuj(b.temp), brakTemp: false }));
    }
    for (const d of grupa.dni) this._rozwiniete.add(d);
    this._render();
  }


  async _zapisz() {
    if (this._blediWalidacji().length) return;
    this._zapisywanie = true;
    this._render();
    try {
      const msg = {
        type: "schedule/update",
        schedule_id: this._scheduleId,
        name: this._dane.name,
        icon: this._dane.icon,
      };
      for (const [klucz] of DNI) {
        msg[klucz] = [...this._dane.dni[klucz]]
          .sort((a, b) => naMinuty(a.from) - naMinuty(b.from))
          .map((b) => ({
            from: pelna(b.from),
            to: pelna(b.to),
            data: { temperatura: Number(b.temp) },
          }));
      }
      await this._hass.callWS(msg);
      this._brudne = false;
      this._blad = null;
      // Flage zdejmujemy przed _pobierz(), bo to ono rysuje karte po zapisie -
      // inaczej stopka zostawala na "Zapisywanie…".
      this._zapisywanie = false;
      // Krotkie potwierdzenie, potem pasek zapisu sie chowa.
      this._zapisano = true;
      await this._pobierz();
      clearTimeout(this._timerZapisano);
      this._timerZapisano = setTimeout(() => {
        this._zapisano = false;
        // Nie przerysowujemy w trakcie edycji pola - zgubiloby fokus;
        // pasek zniknie przy najblizszym przerysowaniu.
        if (!this._body.matches(":focus-within")) this._render();
      }, 2000);
      return;
    } catch (e) {
      this._blad = `Zapis nieudany: ${e.message || e}`;
    }
    this._zapisywanie = false;
    this._render();
  }

  _odrzuc() {
    this._brudne = false;
    this._blad = null;
    this._pobierz();
  }

  _render() {
    this._rysuj();
  }

  _rysuj() {
    if (!this._karta) {
      this._karta = document.createElement("ha-card");
      this._style = document.createElement("style");
      this._style.textContent = `
        /* Odstep tytul -> pierwszy dzien jak w karcie encji HA (16 px): naglowek ha-card
           ma 24 px dolnego paddingu, karta encji podciaga tresc o 8 px. */
        .tresc { padding:0 16px 16px; margin-top:-8px; }
        .grupa:first-of-type { margin-top:0; }
        .grupa { margin:12px 0 4px; }
        .dni { display:flex; align-items:center; gap:4px;
          border-top:1px solid var(--divider-color); }
        .naglowek-dnia { flex:1; display:flex; align-items:center; gap:8px; min-width:0;
          background:none; border:none; cursor:pointer; font:inherit; text-align:left;
          padding:10px 4px; color:var(--primary-text-color); border-radius:8px; }
        .naglowek-dnia:hover { background:var(--secondary-background-color); }
        .naglowek-dnia:focus-visible { outline:2px solid var(--primary-color); outline-offset:-2px; }
        .naglowek-dnia ha-icon.chev { color:var(--secondary-text-color); --mdc-icon-size:20px;
          flex:0 0 auto; transition:transform .24s cubic-bezier(.4,0,.2,1); }
        .grupa.otwarty .naglowek-dnia ha-icon.chev { transform:rotate(90deg); }

        /* Animacja rozwijania: 0fr -> 1fr pozwala plynnie dojsc do naturalnej
           wysokosci, czego max-height z sztywna wartoscia nie potrafi. */
        .dzien-tresc { display:grid; grid-template-rows:0fr;
          transition:grid-template-rows .26s cubic-bezier(.4,0,.2,1); }
        .grupa.otwarty .dzien-tresc { grid-template-rows:1fr; }
        .dzien-inner { overflow:hidden; min-height:0; }
        .grupa.otwarty .dzien-inner { padding-bottom:6px; }
        @media (prefers-reduced-motion: reduce) {
          .dzien-tresc { transition:none; }
          .naglowek-dnia ha-icon.chev { transition:none; }
        }
        .dni ha-icon-button.aktywny { color:var(--primary-color); }
        .chipy { display:flex; flex-wrap:wrap; gap:6px; padding:4px 0 8px; }
        .chip { font:inherit; font-size:.8rem; min-width:34px; height:28px; padding:0 10px; cursor:pointer;
          border-radius:14px; border:1px solid var(--divider-color); background:none;
          color:var(--secondary-text-color); transition:background .15s ease, color .15s ease, border-color .15s ease; }
        .chip:hover { border-color:var(--primary-color); color:var(--primary-text-color); }
        .chip.wl { background:color-mix(in srgb, var(--primary-color) 22%, transparent);
          border-color:transparent; color:var(--primary-text-color); font-weight:500; }
        .chip[disabled] { cursor:default; opacity:.85; }
        .chip:focus-visible { outline:2px solid var(--primary-color); outline-offset:1px; }
        .naglowek-dnia .nazwa { font-weight:600; font-size:.92rem; flex:0 0 auto; }
        .naglowek-dnia .podsumowanie { color:var(--secondary-text-color); font-size:.84rem;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dni ha-icon-button { --mdc-icon-button-size:32px; --mdc-icon-size:17px; }
        .grupa:first-of-type .dni { border-top:none; padding-top:0; }
        /* Dwie linie: godziny + usun u gory, suwak z wartoscia pod spodem.
           W jednej linii (~490 px) nie miescilo sie w karcie i ucinalo wartosc. */
        .wiersz { display:grid; grid-template-columns:auto auto 1fr auto;
          grid-template-areas:"od do . usun" "suw suw suw val";
          align-items:center; column-gap:8px; row-gap:2px; padding:6px 0; }
        .wiersz > :nth-child(1) { grid-area:od; }
        .wiersz > :nth-child(2) { grid-area:do; }
        .wiersz > :nth-child(3) { grid-area:suw; min-width:0; }
        .wiersz > :nth-child(4) { grid-area:val; }
        .wiersz > :nth-child(5) { grid-area:usun; justify-self:end; }
        .wiersz ha-slider { width:100%; --md-slider-active-track-color:var(--primary-color);
          --md-slider-handle-color:var(--primary-color); }
        .wiersz input[type=range] { width:100%; accent-color:var(--primary-color); }
        .val { font-variant-numeric:tabular-nums; min-width:72px; text-align:right;
          color:var(--primary-text-color); font-size:.95rem; }
        ha-icon-button { --mdc-icon-button-size:40px; --mdc-icon-size:20px;
          color:var(--secondary-text-color); flex:0 0 auto; }
        ha-icon-button.usun:hover { color:var(--error-color); }
        ha-icon-button:not(.usun):hover { color:var(--primary-text-color); }
        /* Pole czasu: wyglad pola tekstowego HA (obrys, zaokraglenie, fokus). */
        .czas { display:inline-flex; align-items:center; height:36px; padding:0 8px;
          border:1px solid var(--divider-color); border-radius:8px; gap:1px;
          background:var(--card-background-color); color:var(--primary-text-color);
          font-variant-numeric:tabular-nums; transition:border-color .15s ease; }
        .czas:hover { border-color:var(--secondary-text-color); }
        .czas:focus-within { border-color:var(--primary-color); box-shadow:0 0 0 1px var(--primary-color); }
        .czas input { width:2.2ch; border:none; outline:none; background:none; padding:0;
          color:inherit; font:inherit; font-size:.95rem; text-align:center; caret-color:var(--primary-color); }
        .czas input:focus { background:color-mix(in srgb, var(--primary-color) 18%, transparent); border-radius:4px; }
        .czas .dwukropek { color:var(--secondary-text-color); }
        .czas .pora { margin-left:6px; border:none; border-radius:4px; padding:2px 4px; cursor:pointer;
          background:var(--secondary-background-color); color:var(--primary-text-color); font:inherit; font-size:.8rem; }
        .pusto { color:var(--secondary-text-color); font-style:italic; padding:4px 0; }
        /* Warianty zapasowe: uzywane tylko wtedy, gdy komponentu HA brak. */
        .zapasowy { font:inherit; border:1px solid var(--divider-color); border-radius:8px;
          background:var(--card-background-color); color:var(--primary-text-color);
          padding:6px 12px; cursor:pointer; }
        .zapasowy.glowny { background:var(--primary-color); color:var(--text-primary-color);
          border-color:var(--primary-color); }
        .zapasowy[disabled] { opacity:.45; cursor:default; }
        .zapasowy.ikonka { border:none; background:none; font-size:1.15rem; padding:2px 8px; }
        .stopka { display:flex; justify-content:space-between; align-items:center;
          gap:12px; margin-top:14px; padding:12px 14px; border-radius:10px;
          background:var(--secondary-background-color); transition:background .2s ease; }
        .stopka.zmiany { background:color-mix(in srgb, var(--primary-color) 14%, transparent); }
        .stopka.zmiany .stan { color:var(--primary-color); font-weight:600; }
        .miejsce-paska, .miejsce-bledow { display:flow-root; }
        .stopka .przyciski { display:flex; gap:8px; align-items:center; }
        .stopka mwc-button, .stopka ha-button { --mdc-theme-primary:var(--primary-color); }

        .stan { font-size:.85rem; color:var(--secondary-text-color); }
        .blad { color:var(--error-color); font-size:.85rem; padding:8px 0; }
        .ostrzezenie { color:var(--warning-color); font-size:.8rem; }
      `;
      this._karta.appendChild(this._style);
      this._body = document.createElement("div");
      this._karta.appendChild(this._body);
      this.appendChild(this._karta);
    }

    if (this._blad && !this._dane) {
      this._body.innerHTML = `<div class="tresc blad">${this._blad}</div>`;
      return;
    }
    if (!this._dane) {
      this._body.innerHTML = `<div class="tresc stan">Wczytywanie…</div>`;
      return;
    }
    // "Niezapisane zmiany" tylko gdy dane roznia sie od zapisanych w HA - klikniecie
    // i odklikniecie dnia (albo suwak z powrotem na te sama wartosc) nic nie zmienia.
    this._brudne = this._sygnatura() !== this._oryginal;

    const { unit } = this._config;
    const fmt = formatLiczby(this._hass);
    const { min, max, step } = this._limity();
    const tytul = this._config.title || this._dane.name || this._scheduleId;
    const bledy = this._blediWalidacji();

    const grupy = this._grupy();
    // Standardowy naglowek ha-card (rozmiar i krój jak w innych kartach HA), bez ikony.
    this._karta.header = tytul;
    let html = `<div class="tresc">`;

    grupy.forEach((g, gi) => {
      const bloki = this._dane.dni[g.dni[0]];
      const otwarty = g.dni.some((d) => this._rozwiniete.has(d));
      const n = bloki.length;

      const nowa = this._nowaGrupa && g.dni.length === 1 && g.dni[0] === this._nowaGrupa;
      html += `<div class="grupa${otwarty ? " otwarty" : ""}${nowa ? " nowa" : ""}" data-g="${gi}">
        <div class="dni">
          <button class="naglowek-dnia" data-g="${gi}" aria-expanded="${otwarty}">
            <ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>
            <span class="nazwa">${this._etykieta(g)}</span>
            <span class="podsumowanie">${this._podsumowanie(g)}</span>
          </button>
          ${schowek ? `<span class="slot-wklej" data-g="${gi}"></span>` : ""}
          <span class="slot-kopiuj" data-g="${gi}"></span>
        </div>
        <div class="dzien-tresc"><div class="dzien-inner">`;
      if (this._config.grupuj_dni) {
        // Chipy dni: ktore dni korzystaja z tych blokow.
        html += `<div class="chipy" role="group" aria-label="Dni z tymi blokami">${DNI.map(([k, skrot, pelna]) => {
          const w = g.dni.includes(k);
          const jedyny = w && g.dni.length === 1;
          return `<button class="chip${w ? " wl" : ""}" data-g="${gi}" data-d="${k}" aria-pressed="${w}"
            aria-label="${pelna}"${jedyny ? " disabled" : ""}>${skrot}</button>`;
        }).join("")}</div>`;
      }

      if (!n) {
        html += `<div class="pusto">brak bloków - obowiązuje podtrzymanie przez całą dobę</div>`;
      }
      bloki.forEach((b, bi) => {
        const nowy = this._nowy && this._nowy.dzien === g.dni[0] && this._nowy.from === b.from;
        html += `<div class="wiersz${nowy ? " nowy" : ""}">
          <span class="slot-od" data-g="${gi}" data-b="${bi}"></span>
          <span class="slot-do" data-g="${gi}" data-b="${bi}"></span>
          <span class="slot" data-g="${gi}" data-b="${bi}"></span>
          <span class="val">${fmt(b.temp)} ${unit}</span>
          <span class="slot-usun" data-g="${gi}" data-b="${bi}"></span>
        </div>`;
      });
      html += `<span class="slot-dodaj" data-g="${gi}"></span></div></div></div>`;
    });

    html += `<div class="miejsce-stopki"><div class="miejsce-bledow"></div><div class="miejsce-paska"></div></div>`;
    html += `</div>`;

    this._body.innerHTML = html;
    this._hBledow = undefined;

    // Suwak: uzywamy komponentu HA (ha-slider), zeby wyglad i zachowanie
    // byly identyczne jak w wierszach input_number. Fallback na natywny range,
    // gdyby komponent nie byl jeszcze zarejestrowany.
    const natywny = !!customElements.get("ha-slider");
    this._body.querySelectorAll(".slot").forEach((slot) => {
      const gi = +slot.dataset.g, bi = +slot.dataset.b;
      const blok = this._dane.dni[grupy[gi].dni[0]][bi];
      let el;
      if (natywny) {
        el = document.createElement("ha-slider");
        el.setAttribute("labeled", "");
      } else {
        el = document.createElement("input");
        el.type = "range";
      }
      el.min = min; el.max = max; el.step = step; el.value = blok.temp;
      const czytaj = (ev) => Number(ev.target.value ?? el.value);
      el.addEventListener("input", (ev) => {
        const v = slot.parentElement.querySelector(".val");
        if (v) v.textContent = `${fmt(czytaj(ev))} ${unit}`;
      });
      el.addEventListener("change", (ev) =>
        this._zmien(grupy[gi], bi, "temp", czytaj(ev))
      );
      slot.replaceWith(el);
    });
    // Pola czasu - tekstowe, w formacie 12/24 h z profilu HA.
    const h12 = zegar12(this._hass);
    [["slot-od", "from"], ["slot-do", "to"]].forEach(([klasa, pole]) => {
      this._body.querySelectorAll(`.${klasa}`).forEach((slot) => {
        const gi = +slot.dataset.g, bi = +slot.dataset.b;
        const blok = this._dane.dni[grupy[gi].dni[0]][bi];
        const el = polCzasu(blok[pole], h12, (v) => this._zmien(grupy[gi], bi, pole, v));
        slot.replaceWith(el);
      });
    });

    // Usuwanie bloku - ha-icon-button z ikona kosza.
    this._body.querySelectorAll(".slot-usun").forEach((slot) => {
      const gi = +slot.dataset.g, bi = +slot.dataset.b;
      const el = ikonaHA("mdi:close", "Usuń");
      el.classList.add("usun");
      el.addEventListener("click", () => {
        const wiersz = el.closest(".wiersz");
        // Usuwamy dopiero po zwinieciu - i tylko jesli karta w miedzyczasie nie zostala
        // przerysowana (np. "Odrzuc"), bo wtedy indeks dotyczylby juz innych danych.
        zwin(wiersz, () => { if (wiersz.isConnected) this._usun(grupy[gi], bi); });
      });
      slot.replaceWith(el);
    });

    // Chipy dni - przenoszenie dni miedzy grupami.
    this._body.querySelectorAll(".chip").forEach((el) => {
      el.addEventListener("click", () => this._przelaczDzien(grupy[+el.dataset.g], el.dataset.d));
    });

    // Rozwijanie / zwijanie dnia.
    this._body.querySelectorAll(".naglowek-dnia").forEach((el) => {
      el.addEventListener("click", () => {
        const gi = +el.dataset.g;
        const g = grupy[gi];
        const otwarty = g.dni.some((d) => this._rozwiniete.has(d));
        for (const d of g.dni) {
          if (otwarty) this._rozwiniete.delete(d);
          else this._rozwiniete.add(d);
        }
        // Bez pelnego _render(): przelaczamy klase na istniejacym DOM,
        // dzieki czemu przejscie CSS ma stan poczatkowy i koncowy do animacji.
        const grupaEl = this._body.querySelector(`.grupa[data-g="${gi}"]`);
        if (grupaEl) grupaEl.classList.toggle("otwarty", !otwarty);
        el.setAttribute("aria-expanded", String(!otwarty));
      });
    });

    // Kopiowanie bloków grupy do schowka i wklejanie ze schowka.
    this._body.querySelectorAll(".slot-kopiuj").forEach((slot) => {
      const gi = +slot.dataset.g;
      const zrodlo = this._zrodloSchowka(grupy[gi]);
      const el = ikonaHA("mdi:content-copy", "Kopiuj");
      if (zrodlo) el.classList.add("aktywny");
      el.addEventListener("click", () => this._kopiuj(grupy[gi]));
      slot.replaceWith(el);
    });
    this._body.querySelectorAll(".slot-wklej").forEach((slot) => {
      const gi = +slot.dataset.g;
      const el = ikonaHA("mdi:content-paste", "Wklej");
      el.addEventListener("click", () => this._wklej(grupy[gi]));
      slot.replaceWith(el);
    });

    // Dodawanie bloku.
    this._body.querySelectorAll(".slot-dodaj").forEach((slot) => {
      const gi = +slot.dataset.g;
      const el = przyciskHA("Dodaj blok", { ikona: "mdi:plus" });
      el.addEventListener("click", () => this._dodaj(grupy[gi]));
      slot.replaceWith(el);
    });

    // Pasek zapisu narysowany od zera przy pelnym przerysowaniu nie wysuwa sie
    // ponownie - animacja tylko gdy pojawia sie po raz pierwszy.
    this._renderStopkaPoRysowaniu();
    rozwin(this._body.querySelector(".wiersz.nowy"));
    rozwin(this._body.querySelector(".grupa.nowa"));
    this._nowy = null;
    this._nowaGrupa = null;
  }
}

customElements.define("heating-schedule-card", HeatingScheduleCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "heating-schedule-card",
  name: "Harmonogram grzania",
  description: "Edycja bloków i temperatur harmonogramu suwakiem",
});
console.info("%c heating-schedule-card %c 1.16.1 ", "background:#0C6675;color:#fff", "background:#444;color:#fff");
