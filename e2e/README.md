# Teste ponta a ponta (navegador real)

Percorre o fluxo completo no Chromium: configuração inicial → empresa com logo → departamento →
modelo pronto no editor → exportar/importar modelo → vincular ao departamento → pessoa com foto 3x4 →
conectar a impressora na tela de impressão → cartão de teste → pré-visualização 1013×638 → impressão → PDF → custo → login.

```bash
npm run build
npm install --no-save playwright   # baixa o Chromium na primeira vez
node e2e/fluxo-completo.mjs        # ou CHROME_PATH=/caminho/do/chrome node e2e/fluxo-completo.mjs
```

As capturas de tela ficam em `e2e/shots/`. O teste usa uma pasta de dados temporária e a porta 3099.

Versão para celular (Chromium emulando um telefone com toque): `node e2e/fluxo-celular.mjs` — cobre o
menu em gaveta, o cadastro com foto pela câmera, o editor ajustado à tela, a impressão e a página de
acesso pelo celular. Capturas em `e2e/shots-mobile/`.
