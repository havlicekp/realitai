# RealitAI v telefonu – nastavení (jednou, asi 10 minut)

Aplikace v telefonu je statická webová stránka (tato složka). Data jí posílá rozšíření RealitAI přes skrytou složku aplikace ve vašem Google Drive. Složku v Drive nevidíte a aplikace nevidí nic jiného z vašeho Drive (oprávnění `drive.appdata`). Žádný server, žádné klíče v kódu.

## 1. Google Cloud – projekt a Drive API
1. Otevřete <https://console.cloud.google.com/> a vytvořte nový projekt **RealitAI**.
2. **APIs & Services → Library**, vyhledejte **Google Drive API** a klikněte na **Enable**.

## 2. Přihlašovací obrazovka (Google Auth Platform)
1. **Google Auth Platform → Branding**: název aplikace **RealitAI**, váš e‑mail jako kontakt.
2. **Audience**: typ **External**, stav **Testing**. Do **Test users** přidejte svůj Google účet.
3. **Data access → Add or remove scopes**: přidejte `https://www.googleapis.com/auth/drive.appdata`.

Ověření aplikace Googlem není potřeba, protože ji používáte jen vy jako testovací uživatel. V režimu Testing se Google může jednou za čas znovu zeptat na souhlas.

## 3. GitHub Pages – kde aplikace poběží
1. Na GitHubu vytvořte repozitář, například `realitai`. Může být veřejný, obsahuje jen kód, žádná data.
2. Nahrajte do něj **obsah této složky** (`index.html`, `app.js`, `icons/` …). Soubor `.nojekyll` nechte.
3. **Settings → Pages**: Source **Deploy from a branch**, branch `main`, složka `/ (root)`.
4. Po minutě poběží na `https://VAŠE-JMÉNO.github.io/realitai/`.

## 4. Přihlašovací klient
**Google Auth Platform → Clients → Create client**, typ **Web application**, název **RealitAI**:
- **Authorized JavaScript origins:** `https://VAŠE-JMÉNO.github.io`
- **Authorized redirect URIs:**
  - `https://VAŠE-JMÉNO.github.io/realitai/` (adresa aplikace, včetně lomítka na konci)
  - adresa z rozšíření: **Nastavení → Telefon** (tvar `https://…​.chromiumapp.org/`)

Zkopírujte **Client ID** (`…apps.googleusercontent.com`). Je veřejné, není to heslo. Můžete ho vložit i do `config.js`, pak ho aplikace v telefonu nebude chtít.

## 5. Rozšíření
**Nastavení → Telefon**: vložte Client ID a klikněte na **Připojit Google Drive**. Po souhlasu se archiv poprvé odešle (stovky nabídek trvají desítky sekund). Pak se odesílá samo po stažení uložených inzerátů a každých 30 minut, když se něco změnilo.

## 6. Telefon
1. Otevřete adresu aplikace: na iPhonu v **Safari**, na Androidu v **Chrome**.
2. Vložte Client ID (pokud není v `config.js`) a klepněte na **Přihlásit se přes Google**.
3. Přidejte aplikaci na plochu. iPhone: **Sdílet → Přidat na plochu**. Android: **⋮ → Instalovat aplikaci**.

Aplikace si data uloží do telefonu a funguje i bez signálu. Přihlášení platí hodinu a pak se při otevření aplikace samo obnoví. Při výpadku přihlášení zůstávají data k dispozici.

## Bezpečnost
- Přístup kdykoli odeberete v Google účtu: **Zabezpečení → Aplikace třetích stran**.
- Ztracený telefon: odeberte přístup v Google účtu. V aplikaci data smaže tlačítko **Nastavení → Odpojit Google účet a smazat data z telefonu**.
- Data z Drive smažete v rozšíření tlačítkem **Nastavení → Telefon → Odpojit a smazat data v Drive**.
- Adresa rozšíření (`…chromiumapp.org`) se váže na složku, ze které je rozbalené rozšíření načtené. Když ho načtete odjinud, adresa se změní a je potřeba ji v klientovi Google aktualizovat.
