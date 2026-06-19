# Ghid prezentare licență — Favigon

Document de pregătire pentru susținerea lucrării *Favigon* (Vasile Rareș-Mihail).
Conține: (0) strategia și regulile, (1) structura slide-urilor, (2) textul de vorbit
slide cu slide (cronometrat), (3) scenariul de demo pas-cu-pas, (4) întrebări probabile +
unde arăți în cod, (5) checklist final.

> **Regula de aur:** slide-urile au cuvinte-cheie, NU le citești. Acest document e pentru
> repetat acasă până internalizezi mesajele — nu pentru citit în fața comisiei.

---

## Cuprins
- [0. Strategie și reguli (rezumat)](#0-strategie-și-reguli-rezumat)
- [1. Structura slide-urilor](#1-structura-slide-urilor)
- [2. Textul de vorbit, slide cu slide (cronometrat ~10 min)](#2-textul-de-vorbit-slide-cu-slide-cronometrat-10-min)
- [3. Scenariul de demo pas-cu-pas](#3-scenariul-de-demo-pas-cu-pas)
- [4. Întrebări probabile + unde arăți în cod](#4-întrebări-probabile--unde-arăți-în-cod)
- [5. Checklist final](#5-checklist-final)

---

## 0. Strategie și reguli (rezumat)

**Buget de timp: ~10 min tu, restul comisia (max 15 total).** Demo-ul îți influențează nota cel mai mult.

| Segment | Timp | Conținut |
|---|---|---|
| Slide-uri deschidere | ~3:30 | problemă → ce e Favigon → poziționare → arhitectură → contribuție |
| **Demo live** | ~4:30 | login → editor → AI → export → explore/fork |
| Slide-uri închidere | ~2:00 | validare/securitate → limitări → AFCO → viitor → concluzie |

**Reguli pe care le încalcă des studenții:**
- **R4** — pe slide-uri NU pui screenshot-uri din aplicație (se văd la demo). Slide = diagrame, cifre, contribuții.
- **R5** — nu citești de pe foaie/telefon/slide.
- **R11** — pornești din **browser / `docker compose`**, NU din Visual Studio / `dotnet run` în IDE.
- **R13** — codul sursă pe același calculator; trebuie să arăți exact unde e implementat X.
- **R14–15** — fără modificări last-minute; fără schimbat parole/URL-uri; nimic major diferit de ce ai depus pe e-learning.

**Observațiile tale, tratate:**
- **AFCO** → menționat scurt (slide 1 + slide final). Participare ≠ premiu, dar tot poate aduce credit (R7). Fără scuze.
- **Fără mentor de firmă** → nu pui nimic despre firmă (R8–9 nu te privesc). Nu e un minus.
- **AI „nu wow”** → NU spune asta. Datele tale: 100% succes, 100% structură validă, export 100%. Limitarea reală = **latența (~107 s)** + finisare vizuală manuală. Poziționare: **AI = accelerator al primei versiuni, nu sursă finală de adevăr.** Onest + încrezător, nu defensiv.

---

## 1. Structura slide-urilor

9 slide-uri, text minim. Conținutul exact și ce spui pe fiecare sunt în secțiunea 2.

| # | Slide | Conține (pe ecran) |
|---|---|---|
| 1 | **Titlu** | Favigon · numele tău · coordonator [Prof./Conf. dr. ...] · facultate/specializare · mic: „Prezentat la AFCO 2026” |
| 2 | **Problema & golul** | 1 propoziție-problemă + mini-schemă „idee → design → cod” cu ruptură; cele 3 subprobleme |
| 3 | **Ce e + poziționare** | tabel-esență cu rândurile diferențiatoare (vs Figma/Webflow/Framer/Builder.io) |
| 4 | **Arhitectura** | diagramă Angular ↔ API → Application → Infrastructure (PostgreSQL) + Converter, cu IR în centru; Docker + Cloudflare Tunnel |
| 5 | **Contribuția centrală** | diagrama pipeline: Prompt → Intenție → Structură IR → Stilizare → IR validat → Convertor → HTML/React/Angular |
| 6 | **DEMO** | slide-marcaj (gol) |
| 7 | **Validare & securitate** | cifre: 109/109 teste · benchmark 5 prompturi 100% / ~106,8 s · coverage 18,33% · măsuri securitate |
| 8 | **Limitări + viitor** | latență · finisare manuală · testare frontend · → reducere latență, IR mai bogat, teste e2e, componente, publicare live |
| 9 | **AFCO + concluzie** | „Prezentat la AFCO 2026” · concluzia · Mulțumesc |

**Tabelul-esență pentru slide 3** (doar rândurile unde te diferențiezi):

| | Figma | Webflow | Framer | Builder.io | **Favigon** |
|---|---|---|---|---|---|
| Model intern pt. export multi-framework | nu | nu | limitat | parțial | **da** |
| Export HTML + React + Angular | nu direct | nu direct | limitat | integrare | **da** |
| Funcții sociale în aceeași platformă | nu | nu | nu | nu | **da** |
| Reutilizare prin fork/star/like | nu | nu | nu | nu | **da** |

---

## 2. Textul de vorbit, slide cu slide (cronometrat ~10 min)

> Acesta e textul de **repetat și internalizat**, nu de citit. Marcajele `[~Xs]` te ajută să te încadrezi.
> Frazele **îngroșate** sunt cele pe care trebuie să le rostești clar — sunt punctele care îți aduc nota.

### Slide 1 — Titlu `[~30s]`
„Bună ziua. Mă numesc Vasile Rareș-Mihail și voi prezenta lucrarea de licență *Favigon*, coordonată de [titlu + nume coordonator].
Favigon este o platformă web full-stack care leagă într-un singur flux **trei lucruri care de obicei sunt separate: editarea vizuală a unei interfețe, generarea asistată de AI și exportul în cod**.
Am prezentat proiectul și la sesiunea AFCO din acest an.”

> Nu zăbovi pe titlu. O frază de poziționare și treci mai departe.

### Slide 2 — Problema & golul `[~45s]`
„Punctul de plecare e o problemă practică: în fluxul obișnuit de lucru, **designul se face într-un instrument, iar codul se rescrie manual de la zero**. Fiecare trecere între etape consumă timp și se pierde din intenția inițială.
De aici rezultă trei subprobleme pe care le-am urmărit: **una de editare vizuală** — un spațiu în care construiești interfața fără să intri în cod; **una de reprezentare internă** — pentru AI și pentru export nu îți ajunge ceva care arată bine, ai nevoie de un model de date validabil; și **una de reutilizare** — un proiect, odată creat, ar trebui să poată fi publicat și reluat de alții.
Favigon răspunde la toate trei în aceeași aplicație.”

### Slide 3 — Ce e + poziționare `[~60s]`
„Ca să fiu corect: **nu pretind că Favigon e mai matur decât Figma sau Builder.io** — ar fi o comparație nerealistă. Ce face Favigon e că **combină într-o singură platformă, academică și controlabilă tehnic, lucruri care în alte produse apar separat.**
Concret, ce mă diferențiază: am **un model intern propriu pentru export către mai multe framework-uri**, exportul merge în **HTML, React și Angular**, și am **funcții sociale în aceeași platformă** — publicare, like, star, follow și fork — pe care instrumentele de design nu le au.
Figma e excelent pentru design și handoff, dar nu te duce până la cod executabil. Webflow publică site-uri, dar nu îți dă un model reutilizabil între framework-uri. Framer pornește din prompt, dar nu expune etapele interne. **Eu am făcut tocmai aceste etape explicite și controlabile.**”

### Slide 4 — Arhitectura `[~45s]`
„Tehnic, frontend-ul e **Angular 20 cu componente standalone și signals**, backend-ul e **ASP.NET Core 9 pe arhitectură în straturi** — API, Application, Infrastructure — plus un **proiect separat pentru convertor**. Persistența e pe **PostgreSQL**, iar totul e orchestrat cu **Docker Compose**, cu expunere prin Cloudflare Tunnel.
API-ul are **6 controllere și 62 de endpoint-uri**. În centrul întregii arhitecturi stă **reprezentarea intermediară, IR-ul** — același model e folosit și de editor, și de AI, și de convertor. Asta e piesa care ține totul împreună.”

### Slide 5 — Contribuția centrală `[~45s]`
„Contribuția tehnică principală **nu este că am folosit un model AI** — oricine poate apela un model. Contribuția e **integrarea controlată**.
Generarea AI **nu produce direct cod**. Trece printr-un **pipeline în trei faze: întâi intenția** — ce fel de pagină, ce secțiuni; **apoi structura** — arborele IR cu layout și dimensiuni; **apoi stilizarea** — culori, umbre, tipografie, fără să strice structura.
Rezultatul e un IR **validat cu JSON Schema**, care intră în editor ca să-l rafinezi, și de acolo în convertor pentru export. Vă arăt acum pe viu cum funcționează.”

> Treci la DEMO. Pipeline-ul îl explici din nou, mai pe scurt, cât rulează generarea.

### — DEMO — `[~4:30]` (vezi secțiunea 3)

### Slide 7 — Validare & securitate `[~45s]`
„Pe validare: **backend-ul are 109 teste automate, toate trec**, concentrate pe zonele cu risc — autentificare, proiecte, convertor, middleware.
Pe AI am făcut un **benchmark separat, pe 5 prompturi**: rată de succes 100%, structură validă din prima 100%, export reușit 100%, cu un timp mediu de **~107 secunde** — și aici e principala limitare practică, latența.
Sunt onest cu acoperirea: **coverage-ul global e 18%**, dar e neuniform intenționat — Converter-ul și Application sunt la 40–47%, exact unde e logica importantă; Infrastructure e încă netestată.
Pe securitate: **JWT în cookie HttpOnly cu refresh token separat, 2FA pe email, rate limiting** pe categorii de endpoint-uri, CORS și HSTS în producție, plus validare la upload.”

### Slide 8 — Limitări + viitor `[~40s]`
„Limitele, spuse direct: **latența AI de ~107 secunde** e prea mare pentru o interacțiune fluidă; **rezultatul AI mai cere finisare manuală** de text și spacing; **testarea frontend e modestă** — doar 2 teste; și **nu am încă editare colaborativă în timp real**.
Direcțiile de continuare merg fix pe ele: **reducerea latenței** prin cache și precompunere, un **IR mai bogat cu mai multe reguli**, **teste end-to-end pe editor**, componente reutilizabile și publicarea proiectelor ca site-uri live.”

### Slide 9 — AFCO + concluzie `[~35s]`
„Am prezentat Favigon la **sesiunea AFCO** din acest an.
În concluzie: Favigon nu rezolvă complet zona design-to-code, dar **demonstrează că un astfel de flux poate fi construit coerent, explicabil și controlabil tehnic** — editor vizual, reprezentare intermediară, pipeline AI și motor de conversie care funcționează împreună ca un produs real, nu ca un demo izolat.
Vă mulțumesc. Aștept întrebările.”

**Total estimat: ~3:30 deschidere + ~4:30 demo + ~2:00 închidere = ~10:00.**
Dacă rămâi în urmă, slide-ul 8 e cel pe care îl scurtezi (spui doar latența + un viitor).

---

## 3. Scenariul de demo pas-cu-pas

**Ordinea:** login → editor (editare scurtă) → generare AI (cu narațiune) → export → explore/fork.

> **Înainte să intri în sală, aplicația e DEJA pornită** (`docker compose up`), DB migrată, o generare de probă făcută (cache cald). Te loghezi în pauza dinaintea demo-ului dacă poți, ca să economisești timp.

### Tabelul demo (acțiune ↔ ce spui)

| # | ACȚIUNE (ce dai click) | CE SPUI | Timp |
|---|---|---|---|
| 1 | Ești pe `/login`. Introduci credențialele contului de test, Enter. | „Mă autentific. În spate, backend-ul emite **JWT-ul într-un cookie HttpOnly** și un **refresh token separat**, pe un path dedicat — token-ul nu ajunge în JavaScript-ul din browser.” | ~25s |
| 2 | Ești redirecționat la profil/proiecte. Deschizi un **proiect existent** în canvas (`/project/:slug`). | „Aici e editorul canvas — partea cea mai complexă din aplicație. E construit din **servicii separate**: stare, viewport, istoric, gesturi, persistare.” | ~20s |
| 3 | Selectezi un element, îl **muți**, îl **redimensionezi**, **dublu-click** pe un text și îl editezi. | „Manipulare directă, cu feedback imediat. Tot ce fac se **salvează automat** — autosave cu debounce la 500 ms și flush forțat când părăsesc pagina. Nu există buton de Save pe care să-l uit.” | ~40s |
| 4 | Deschizi panoul AI, scrii un prompt scurt (ex. *„landing page pentru o aplicație de task management, cu hero, beneficii și call-to-action”*), pornești generarea. | „Acum pornesc generarea AI. **Nu cere cod direct.** Urmăriți progresul — vine prin streaming, pe faze.” | ~15s |
| 5 | **Cât rulează** (vezi evenimentele phase_start/phase_complete): | „**Faza 1, intenția** — extrage ce fel de pagină e și ce secțiuni are. **Faza 2, structura** — construiește arborele IR cu layout și dimensiuni. **Faza 3, stilizarea** — pune culori și tipografie, fără să strice structura. Fiecare fază e validată cu **JSON Schema**, iar dacă structura e invalidă există un pas de **auto-reparare**. Durează în jur de un minut–două — e principala limitare, latența.” | ~60s |
| 6 | Rezultatul apare în canvas. Faci o mică ajustare (muți o secțiune / schimbi un text). | „Rezultatul intră **direct în editor ca structură editabilă**, nu ca export static. AI-ul e **accelerator al primei versiuni** — de aici încolo rafinez eu.” | ~30s |
| 7 | Deschizi exportul, alegi **HTML** (apoi arăți rapid că merge și React/Angular), arăți fișierele generate. | „Export în **HTML, React sau Angular**, din același IR. Exportul propriu-zis durează **sub 31 de milisecunde** — costul e în AI, nu în convertor. Suportă și **multi-page** și **responsive**.” | ~45s |
| 8 | Mergi la `/explore`, deschizi un proiect public, dai **like/star**, apoi **fork**. | „Partea socială: proiectele publice pot fi apreciate și **fork-uite**. La fork se creează **o copie privată la mine, cu legătură către sursă** — reutilizare concretă, nu doar vizionare.” | ~35s |
| 9 | (opțional, dacă mai ai timp) Deschizi fork-ul tău în editor. | „Și pot continua editarea fork-ului ca pe orice proiect al meu.” | ~20s |

**Total demo: ~4:30.** Dacă rămâi fără timp, sari pasul 9 și scurtezi pasul 7.

### Plan B (OBLIGATORIU de pregătit)

| Risc | Plan B |
|---|---|
| OpenAI lent / pică / fără net | Ai în cont **un proiect deja generat cu AI**. Spui: „Am aici un rezultat generat anterior” și arăți direct rezultatul + explici fazele pe slide-ul 5. NU aștepta în tăcere. |
| Vrei doar fazele intermediare, repede | Folosește `StopAfterPhase` (oprire după faza 1 sau 2) ca să arăți structura fără să aștepți stilizarea. |
| Net instabil în sală | **Hotspot pe telefon** pregătit dinainte (R12). Restul aplicației — editor, export, explore — merge și fără AI: „produsul rămâne util și fără AI”. |
| Generarea blochează demo-ul | Pornește generarea **devreme** (pasul 4) și narează pasul 5 cât rulează; nu o lăsa la final. |

---

## 4. Întrebări probabile + unde arăți în cod

> R13: comisia poate cere „arată-mi exact unde e X”. Ține IDE-ul deschis, ideal pe `AiPipelineService.cs`.

### Unde e implementat X

| Întrebare | Unde arăți |
|---|---|
| Autentificare / login / 2FA / resetare parolă | `Backend/Favigon.Application/Services/AuthService.cs` + `AccountController` |
| JWT în cookie | `AuthService.cs` + `Backend/Favigon.API/Program.cs` |
| Rate limiting | `Backend/Favigon.API/Program.cs` (politicile `auth`/`ai`/`converter`/`users`) |
| Cele 3 faze AI | `Backend/Favigon.Application/Services/AiPipelineService.cs` — `Phase1IntentAsync`, `Phase2StructureAsync`, `Phase3StyleAsync` |
| Integrare OpenAI / streaming SSE / JSON Schema | `Backend/Favigon.Infrastructure/External/AI/OpenAiClient.cs` |
| Modelul intermediar (IR) | `Backend/Favigon.Converter/Models/IRNode.cs` |
| Validare IR / self-repair | `Backend/Favigon.Converter/Validation/IrValidator.cs` + `AiPipelineService` |
| Motor conversie / multi-page / responsive | `Backend/Favigon.Converter/ConverterEngine.cs` + `Backend/Favigon.Converter/Generators/` |
| Fork / like / asset-uri orfane | `Backend/Favigon.Application/Services/ProjectService.cs` |
| Stare editor / autosave / undo / gesturi | `Frontend/src/app/features/canvas/services/canvas-editor-state.service.ts`, `canvas-persistence.service.ts`, `editor/canvas-history.service.ts`, `editor/canvas-gesture.service.ts` |

### „Ce se întâmplă dacă...”

| Întrebare | Răspuns |
|---|---|
| Dacă mi-am uitat parola? | Există flux real: rută `/reset-password`, token pe email, tratat în `AuthService`. **Poți chiar să-l demonstrezi.** |
| Dacă greșesc codul 2FA? | Sesiunea finală nu se acordă; rămâi în starea intermediară cu token temporar. |
| Dacă AI-ul întoarce JSON invalid? | Validare pe schemă + pas de self-repair; dacă tot e invalid, exportul e refuzat (preferabil cod inconsistent). |
| Doi useri fac fork la același proiect? | Fiecare primește copie privată proprie; duplicatele sunt evitate (acoperit de teste). |
| Fișier prea mare / tip greșit la upload? | Validare tip + dimensiune; limite 5/10/15 MB. |
| Cum protejezi un proiect privat? | `authGuard` pe rute + autorizare în backend. |
| De ce coverage doar 18%? | Onest: concentrat pe zonele cu risc (Converter 47%, Application 39%); Infrastructure 0% trage media în jos; frontend slab acoperit — limitare recunoscută, nu ascunsă. |
| De ce nu generezi direct cod cu AI? | Control redus, validare grea, lipsă de reutilizare. Cu IR + faze pot localiza eroarea și pot exporta în mai multe framework-uri. |

---

## 5. Checklist final (cu o seară înainte)

- [ ] `docker compose up --build` rulează curat; pornesc din **browser**, nu din IDE.
- [ ] Cont de test logat-ready + ≥1 proiect public de fork + 1 proiect deja generat cu AI (Plan B).
- [ ] Hotspot pe telefon pregătit (backup internet pentru OpenAI).
- [ ] IDE deschis lateral pe `AiPipelineService.cs`.
- [ ] Slide-uri fără screenshot-uri din app (R4).
- [ ] Cronometrat acasă: slide-uri ≤3:30, demo ≤4:30, închidere ≤2:00.
- [ ] Repetat demo-ul de 2–3 ori, inclusiv cazul „AI lent → Plan B”.
- [ ] Codul sursă pe **același calculator** (R13).
- [ ] Verificat că NU am făcut modificări majore față de ce am depus pe e-learning (R15).
- [ ] Repetat cu voce tare de cel puțin 3 ori, fără să citesc (R5).
