# Impress-o — impressão de cartões e crachás personalizados

Sistema local, de **usuário único**, para desenhar e imprimir cartões CR80 (crachás) com
foto 3x4, nome, logo e layout totalmente personalizável, integrado à impressora de cartões
**Entrust Sigma DS / DSE** pelo driver oficial, com cálculo de custo de impressão.

## Funcionalidades

- **Editor visual de layout** (Fabric.js): textos, campos dinâmicos (`{{full_name}}`, `{{department}}`…),
  espaço para **foto 3x4**, **logo da empresa**, QR code, formas, imagens e imagem de fundo;
  frente e verso; alinhamento, camadas, desfazer/refazer; medidas em milímetros.
- **Modelos (layouts) por empresa e por departamento**: cada empresa e cada departamento pode ter
  seu modelo padrão; a pessoa pode ter um modelo específico. Modelos prontos para começar.
- **Importar / exportar modelos** em arquivo `.impresso.json` (formato próprio, reimportável), além de
  usar qualquer arte PNG/JPG/SVG como fundo do cartão.
- **Pessoas** com foto 3x4 (upload com recorte na proporção 3:4 ou captura pela webcam), cargo,
  matrícula, validade, campos extras; **importação em lote por CSV**.
- **Impressão** na Entrust Sigma DS pelo driver instalado no sistema (Windows ou Linux), em lote ou
  individual, com pré-visualização exata (1013 × 638 px a 300 dpi), exportação em PNG e PDF no tamanho
  do cartão, histórico de trabalhos e **impressora simulada** para testes sem hardware.
- **Custo de impressão**: cartão, fita (com presets das fitas Sigma DS), limpeza, depreciação,
  cabeça de impressão, mão de obra, energia, desperdício, custos indiretos, margem e impostos;
  calculadora por lote e custo registrado em cada impressão.
- **Um único usuário**: senha definida na primeira execução; tudo roda localmente (SQLite + pasta `data/`).

## Requisitos

- **Node.js 22.13 ou superior** (usa o SQLite embutido do Node, sem compilação nativa).
- Para imprimir de verdade: o **driver oficial Entrust** instalado na máquina
  (Windows: *Entrust XPS Card Printer Driver*; Linux Ubuntu: *Entrust LXM Card Printer Driver*),
  com a Sigma DS conectada por USB ou rede e aparecendo como impressora do sistema.

## Instalação e uso

**Windows:** dê dois cliques em `iniciar.bat` (instala as dependências e compila na primeira vez, depois
abre o navegador em <http://localhost:3070>). **Linux/macOS:** `./iniciar.sh`.

Ou manualmente:

```bash
npm install
npm run build
npm start
```

Abra <http://localhost:3070>. Na primeira vez, defina seu nome e senha. Para desenvolvimento:
`npm run dev` (servidor em 3070 + Vite em <http://localhost:5173>).

Testes: `npm test` (modelo de custo, CSV, validação de modelo, PNG/PDF e API). Verificação de tipos:
`npm run typecheck`. Teste ponta a ponta em navegador real: veja `e2e/README.md`.

Variáveis opcionais (arquivo `.env`, veja `.env.example`): `PORT` (padrão 3070), `HOST` (padrão
127.0.0.1), `DATABASE_URL` (Postgres na nuvem; vazio = SQLite local), `IMPRESSO_DATA_DIR` (pasta de
dados; padrão `./data`), `IMPRESSO_DB_PATH` (arquivo do SQLite), `IMPRESSO_ALLOWED_HOSTS` (hosts
extras aceitos, separados por vírgula) e `IMPRESSO_SECURE_COOKIES=1` (atrás de HTTPS).

## Banco de dados: local ou gratuito na nuvem

Por padrão o sistema grava tudo em um arquivo SQLite em `data/` (sem instalar nada). Para usar um
**banco Postgres gratuito na nuvem**, que permite acessar os mesmos cadastros de mais de um computador
e ter backup automático, defina a variável `DATABASE_URL` (no arquivo `.env`, copiado de
`.env.example`, ou no ambiente). Fotos, logos, modelos, pessoas e histórico passam a ficar no banco;
só a saída de impressão fica na máquina.

**Supabase (grátis: 500 MB, sem cartão):**

1. Crie uma conta em <https://supabase.com> e um projeto (região *South America (São Paulo)*).
2. Em **Project Settings → Database → Connection string**, escolha **URI** no modo **Session pooler**
   (funciona em redes só IPv4) e copie o texto, trocando `[YOUR-PASSWORD]` pela senha do projeto.
3. No `.env`: `DATABASE_URL=postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
4. Inicie o sistema. As tabelas são criadas sozinhas na primeira execução.

**Neon (grátis: 0,5 GB):** crie o projeto em <https://neon.tech>, copie a *connection string* do painel
(já vem com `?sslmode=require`) e use em `DATABASE_URL`.

Observações:

- A impressora continua sendo acessada pelo computador onde o `npm start` roda (é ele que fala com o
  driver Entrust). O banco na nuvem só guarda os dados; vários computadores podem apontar para o mesmo
  banco e imprimir cada um na sua Sigma DS. **Cada computador cadastra a sua impressora** (a lista de
  impressoras e a impressora padrão são por máquina); pessoas, empresas, modelos e histórico são
  compartilhados.
- No Supabase as tabelas são criadas no esquema privado `impresso` (não no `public`) e com *Row Level
  Security* ativo, de modo que a API de dados do Supabase (a chave `anon` que aparece no painel) **não**
  consegue ler nem alterar fotos, pessoas ou senhas. Mesmo assim, não exponha o esquema `impresso` na
  API de dados e não compartilhe a *connection string*.
- Conexões: o sistema usa poucas conexões (3 por máquina, ajustável com `IMPRESSO_DB_POOL_MAX`) porque o
  pooler gratuito do Supabase limita o total; use o modo *Session pooler*.
- Ao trocar de SQLite para Postgres, os arquivos que estavam em `data/uploads` são importados para o
  banco automaticamente na primeira inicialização (os cadastros em si não são migrados: o banco novo
  começa vazio).
- Os testes automatizados rodam a mesma suíte de API nos dois bancos (SQLite e Postgres em memória).

## Uso no celular ou tablet

A interface se adapta a telas pequenas (menu em gaveta, formulários em tela cheia, editor com
"Ajustar" à largura da tela, foto 3x4 tirada com a câmera do aparelho) e pode ser instalada como
aplicativo ("Adicionar à tela inicial").

Para acessar pelo celular na mesma rede Wi-Fi, defina `HOST=0.0.0.0` no arquivo `.env` e reinicie:
o endereço e um QR code aparecem em **Configurações → Acesso pelo celular** e no terminal. A
impressora continua sendo a do computador que roda o sistema; o celular usa só a tela (cadastros,
modelos e envio para impressão).

## Publicar na internet (opcional)

O sistema pode ser hospedado para acesso de qualquer lugar (cadastros, modelos, histórico), usando o
banco do Supabase/Neon. **A impressão continua só no computador ligado à Sigma DS**: rode o
Impress-o também nesse PC, apontando para o mesmo `DATABASE_URL`, e imprima por ele. O servidor na
nuvem e o PC compartilham pessoas, empresas, modelos e histórico; cada um tem suas impressoras.

Render (plano gratuito, com Docker):

1. Crie uma conta em <https://render.com> e escolha **New → Blueprint**, apontando para este
   repositório (o arquivo `render.yaml` já descreve o serviço).
2. Informe a variável `DATABASE_URL` (connection string do Supabase, modo *Session pooler*).
3. Ao terminar o deploy, abra a URL gerada (`https://impress-o-xxxx.onrender.com`), defina a senha e use.

Qualquer outro provedor com Docker funciona com o `Dockerfile` da raiz: defina `DATABASE_URL`,
`IMPRESSO_SECURE_COOKIES=1` e `IMPRESSO_PUBLIC_URL=https://seu-dominio` (para o sistema aceitar o
domínio público). Sem `DATABASE_URL` o contêiner usa um SQLite em `/data` (monte um volume para
persistir).

## Fluxo recomendado

1. **Configurações → Impressoras**: adicione a *Entrust Sigma DS* escolhendo a fila do sistema
   (as filas Entrust/Sigma aparecem marcadas com ★). Use **Verificar** para checar a fila e, se
   informar o IP, a conectividade de rede (Printer Dashboard em `https://<ip>`). Use **Cartão de teste**
   para imprimir um cartão com réguas e blocos de cor e conferir alinhamento/cores.
   Sem impressora, cadastre uma **impressora simulada**: os cartões são gravados como PNG em
   `data/print-output/`.
2. **Empresas e departamentos**: cadastre a empresa (com logo) e seus departamentos.
3. **Modelos de cartão**: instale um modelo pronto, crie um em branco ou importe um `.json`.
   No editor, insira foto 3x4, nome, logo, campos e QR. Use **Vincular** para definir o modelo
   padrão da empresa ou do departamento.
4. **Pessoas**: cadastre com foto 3x4 ou importe um CSV (`nome;cargo;departamento;matrícula;validade`).
5. **Impressão**: selecione as pessoas, gere a pré-visualização (o modelo é escolhido
   automaticamente: pessoa → departamento → empresa) e imprima.
6. **Custo de impressão**: ajuste os parâmetros (preços reais da sua fita e do cartão) e acompanhe o
   custo acumulado.

## Como a impressão funciona

O navegador renderiza o cartão no tamanho real (CR80 = 85,6 × 53,98 mm → **1013 × 638 px a 300 dpi**,
a resolução nativa da Sigma DS) e envia o PNG ao servidor local, que o entrega ao driver:

- **Windows**: script PowerShell com `System.Drawing.Printing` — imprime sem diálogo, sem margens,
  usando o tamanho de papel CR80 informado pelo próprio driver (ou 3,375 × 2,125 pol.), resolução
  300 dpi e duplex quando disponível; acompanha a fila por alguns segundos para detectar erros.
- **Linux (CUPS, driver Entrust LXM)**: gera um PDF com página exatamente do tamanho do cartão e envia
  com `lp -d <fila> -o media=Custom.85.6x54mm -o print-scaling=none`.
- **macOS**: a Entrust não oferece driver para Sigma DS; use a exportação em PDF/PNG.

Opções por impressora: nome do tamanho de papel do driver (Windows), nome da mídia e opções extras do
CUPS (Linux), girar 180°, verso pela borda curta (se o verso sair de cabeça para baixo) e guardar os
PNGs enviados (auditoria). Modelos frente e verso exigem que a impressora esteja marcada como
"Imprime frente e verso"; em impressoras só frente (DS1) o sistema recusa o trabalho em vez de gastar
um segundo cartão com o verso. Mantenha as *Preferências de impressão* do driver Entrust nos
padrões (tamanho do cartão, área de impressão, topcoat) — o sistema só envia a imagem no tamanho certo.

> **Importante:** execute o `npm start` com o mesmo usuário do Windows que enxerga a impressora
> (as filas são por sessão). Este projeto foi desenvolvido sem acesso a uma Sigma DS física; a
> comunicação com o driver segue a documentação da Entrust e da API de impressão do Windows/CUPS,
> mas o primeiro teste com a impressora real deve ser feito com o **Cartão de teste**. A variante
> "Sigma DS2C" vendida em algumas promoções é exclusiva do serviço em nuvem *Instant ID as a Service*
> e não aceita impressão pelo driver local — confirme o modelo com o revendedor.

## Formato do modelo (`.impresso.json`)

```json
{
  "format": "impress-o/template",
  "version": 1,
  "name": "Crachá",
  "orientation": "landscape",
  "doubleSided": false,
  "dpi": 300,
  "width": 1013,
  "height": 638,
  "front": { "backgroundColor": "#ffffff", "fabric": { "version": "7.4.0", "objects": [ ... ] } },
  "back": { ... }
}
```

Cada objeto do Fabric.js carrega o papel do elemento: `role` (`photo`, `logo`, `name`, `field`, `qr`,
`static`), `field`/`textTemplate` (com `{{campos}}`), `fit` (`cover`/`contain`) e `label`.
Campos disponíveis: `full_name`, `display_name`, `role_title`, `registration`, `document`, `email`,
`phone`, `valid_until`, `department`, `company`, `company_cnpj`, `card_number`, `issue_date` e os
campos extras da pessoa.

## Estrutura

```
server/   API Express (TypeScript) — SQLite (node:sqlite), autenticação, cadastros, impressão, custo
client/   Interface React + Vite — editor Fabric.js, telas em pt-BR
shared/   Tipos e regras compartilhadas — CR80, formato do modelo, modelo de custo (com testes)
data/     Banco, fotos/logos e saída de impressão (criada em tempo de execução; fora do git)
```

## Backup

- **SQLite local:** pare o sistema e copie a pasta `data/` inteira (banco `impress-o.sqlite`).
- **Postgres na nuvem:** o Supabase/Neon fazem backup automático; para uma cópia própria use o
  `pg_dump` com a mesma `DATABASE_URL`.
