# 🎬 Roteiro Manager

Visualizador e editor de roteiros em Markdown para gravação de vídeos.

## Features

- **📋 Lista de roteiros** — sidebar com busca em tempo real
- **👁 Visualizador** — renderiza `.md` com badges coloridos, caixas de fala, citações
- **🎙 Teleprompter** — scroll automático com texto hierárquico (títulos muted, fala grande e branca)
- **✏️ Editor** — editor com toolbar Markdown e `Ctrl+S` para salvar
- **📄 Exportar PDF** — print CSS otimizado para impressão
- **⊕ Importar .md** — drag & drop ou seleção de arquivo

## Stack

- **Backend:** Node.js + Express
- **Frontend:** HTML / CSS / JavaScript puro

## Como rodar

```bash
npm install
npm start
```

Acesse em: [http://localhost:3000](http://localhost:3000)

## Estrutura

```
RoteiroManager/
├── server.js          # API REST (lista, lê, salva, renomeia, exclui)
├── roteiros/          # Seus arquivos .md ficam aqui
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── parser.js  # Parser MD → HTML customizado
│       └── app.js     # Lógica da SPA
└── package.json
```

## Teleprompter

- **`Space`** — iniciar / pausar
- **`R`** — reiniciar
- Slider de velocidade
- Botões `A−` / `A+` para tamanho do texto

## Formato de roteiro suportado

```markdown
# Título do Roteiro

---

## Hook — Texto do hook

> Fala de abertura aqui.

*nota de direção*

---

## Bloco 1 — Título do bloco

1. Primeiro ponto do roteiro.

2. Segundo ponto com citação abaixo.

> *"Citação aqui."*
> — Autor, Obra
```
