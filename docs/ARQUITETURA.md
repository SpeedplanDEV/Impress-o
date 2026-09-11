# Arquitetura do Impress-o

## Visão geral

```
Navegador (React + Fabric.js)          Servidor local (Node 22 + Express)            Impressora
┌──────────────────────────┐   HTTP    ┌──────────────────────────────┐   driver   ┌────────────────┐
│ Editor de layout         │ ────────► │ API REST (/api/*)            │ ─────────► │ Entrust Sigma  │
│ Render 300 dpi (PNG)     │           │ SQLite (node:sqlite)         │ PowerShell │ DS1/DS2/DS3/DSE│
│ Recorte de foto 3x4      │ ◄──────── │ Arquivos: data/uploads       │  ou lp     │ (USB / rede)   │
│ Telas em pt-BR           │           │ PrinterAdapter (system|mock) │            └────────────────┘
└──────────────────────────┘           └──────────────────────────────┘
```

- **A renderização do cartão acontece no navegador** (canvas do Fabric.js, no tamanho real de
  impressão). O servidor só recebe o PNG pronto e entrega ao driver. Isso evita dependências
  nativas (canvas/cairo) na máquina do usuário.
- **O servidor é local e de usuário único**: senha com scrypt, sessão em cookie HttpOnly (SameSite=Lax),
  bloqueio progressivo após tentativas erradas, validação de `Host`/`Origin` (contra DNS rebinding e
  requisições de outros sites) e arquivos enviados servidos com CSP `sandbox` (SVG nunca executa script).
- **Persistência**: SQLite embutido no Node (`node:sqlite`, sem compilação) + arquivos em `data/`.

## Módulos

| Caminho | Responsabilidade |
| --- | --- |
| `shared/card.ts` | Constantes CR80 (85,6 × 53,98 mm; 1013 × 638 px a 300 dpi), foto 3x4 (30 × 40 mm), conversões mm↔px |
| `shared/template.ts` | Formato `.impresso.json`, papéis dos elementos (`photo`, `logo`, `name`, `field`, `qr`, `static`), campos dinâmicos, validação |
| `shared/cost.ts` | Modelo de custo puro + presets de fitas Sigma DS + testes |
| `server/src/lib/db.ts` | Abertura do SQLite, migrações, helpers de configuração |
| `server/src/lib/auth.ts` | Usuário único, hash de senha, sessões |
| `server/src/lib/assets.ts` | Upload de imagens (data URL → arquivo), dimensões PNG/JPEG/WebP/GIF |
| `server/src/routes/*` | `companies`, `departments`, `persons` (+ importação CSV), `templates` (+ import/export/duplicar/resolver), `cards` (dados de preenchimento), `printers`, `print` (jobs, PDF, cartão de teste), `cost`, `settings`, `auth` |
| `server/src/printer/*` | `types.ts` (interface `PrinterAdapter`), `system.ts` (driver do SO: PowerShell no Windows, `lp` no CUPS; sondagem do driver; checagem de rede), `mock.ts` (grava PNG), `discovery.ts` (lista impressoras do SO) |
| `server/src/lib/pdf.ts` | PDF no tamanho exato do cartão (pdf-lib) |
| `server/src/lib/png.ts` | Codificador PNG mínimo + cartão de calibração |
| `client/src/editor/render.ts` | Carrega um lado do modelo num `StaticCanvas`, substitui placeholders (texto, foto, logo, QR) e exporta PNG/miniatura |
| `client/src/editor/CardEditor.tsx` | Editor interativo (ferramentas, propriedades, camadas, zoom, frente/verso, desfazer) |
| `client/src/pages/*` | Telas: início, pessoas, empresas/departamentos, modelos, editor, impressão, custo, configurações, login/setup |

## Resolução do modelo na impressão

1. Modelo escolhido na pessoa (`persons.template_id`)
2. Modelo padrão do departamento (`departments.default_template_id`)
3. Modelo padrão da empresa (`companies.default_template_id`)
4. Último modelo vinculado ao departamento, depois à empresa
5. Primeiro modelo cadastrado

## Pipeline de impressão

1. Cliente: `renderCardForPrint(doc, dados)` → PNG frente (e verso) em 1013 × 638 (ou 638 × 1013).
2. `POST /api/print/jobs` valida as dimensões, calcula o custo com os parâmetros ativos e grava o job.
3. `PrinterAdapter.print()`:
   - **system / Windows**: `powershell.exe -File print.ps1` com `System.Drawing.Printing.PrintDocument`:
     `StandardPrintController` (sem diálogo), margens 0, tamanho de papel CR80 do driver (por nome
     ou por dimensão ≈ 3,375 × 2,125 pol., em qualquer orientação; sinalizador *Landscape* calculado
     em relação à forma do papel), resolução 300 dpi se exposta, duplex se `CanDuplex` (borda longa por
     padrão, igual ao CUPS; opção de borda curta), cópias; acompanha `Win32_PrintJob` por até 25 s e,
     em erro/offline, cancela o job na fila para não imprimir em duplicidade depois.
     Se o driver não oferecer duplex, imprime só a frente e avisa. Um modelo com verso em impressora
     configurada como só frente é recusado antes de imprimir.
   - **system / CUPS (Linux)**: PDF com página de 243 × 153 pt (desenhos em retrato são girados 90°
     para a mídia em paisagem) e `lp -d <fila> -n <cópias> -o media=Custom.85.6x54mm -o print-scaling=none`.
   - **mock**: grava `frente.png`/`verso.png` em `data/print-output/job-NNNNNN/`.
4. Resultado e custo ficam no histórico (`print_jobs`).

## Fatos verificados sobre a Entrust Sigma DS (pesquisa, set/2026)

- CR80 (ISO/IEC 7810 ID-1): 85,60 × 53,98 mm; imagem de borda a borda a 300 dpi = **1013 × 638 px**
  (número usado pela própria Entrust nos guias OpenCard).
- Resolução 300 dpi em DS1/DS2/DS3/DSE (modos 300×600 e 300×1200); a DSE imprime frente e verso,
  USB + Ethernet, só CR80, até 185 cartões/h colorido.
- Driver Windows: **Entrust XPS Card Printer Driver** (v8.7, Windows 10/11, Server 2019/2022) — suporta
  Sigma DS1, DS2, DS3, DSE e DS4; a impressora aparece como impressora comum do Windows.
  Driver Linux: **Entrust LXM Card Printer Driver** (Ubuntu 20.04, CUPS). **Não há driver macOS.**
- Rede: porta TCP 9100 pelo driver; *Printer Dashboard* web em `https://<ip>`; SNMP.
- Fitas Sigma (rendimentos nominais): YMCKT 500 imagens; YMCKT-K 375 cartões (frente colorida +
  verso preto); YMCKT-KT 300; KT 1.000; K 1.500. Preços em BRL variam por revendedor
  (YMCKT ≈ R$ 510–580; K ≈ R$ 130–185; cartão PVC ≈ R$ 0,60–1,60).
- Escapes do driver (tarja magnética `~1%…?`, bloqueio de impressão `~PB%`) só funcionam em texto
  enviado como texto; uma imagem rasterizada não os carrega. Use as *Preferências de impressão*
  (aba *Print Area*) do driver para proteger tarja/chip.

## Premissas não verificáveis sem a impressora

- Nome exato do tamanho de papel que o driver Entrust informa ao Windows e se ele aceita tamanho
  personalizado; por isso o script prefere o tamanho informado pelo driver e existe o botão
  **Cartão de teste** e a sondagem (`details.driver` em *Verificar*).
- Área imprimível/overbleed real (se o driver escalar 1–2 px). Ajuste fino, se necessário, pelo
  *Printer Dashboard* ou pela opção "girar 180°".
- Comportamento de um job com 2 páginas com duplex ativo nas preferências do driver (frente/verso)
  — validar na primeira impressão de um modelo frente e verso.
- Pop-ups do driver em erros (fita acabou, cartão preso) na máquina que envia o trabalho.
- A variante **Sigma DS2C** (promoção de trade-in) é exclusiva do *Instant ID as a Service* (nuvem) e
  pode não aceitar jobs do driver local — confirmar o modelo exato com o revendedor.

## Dados pessoais (LGPD)

Fotos e dados ficam apenas na máquina local (`data/`). Excluir uma pessoa remove o vínculo; o
arquivo de foto pode ser removido pela API de assets. Faça backup e controle de acesso ao computador.
