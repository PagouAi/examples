# Pagou API v2 — Exemplos

Exemplos executáveis e testáveis, em várias linguagens, para os fluxos principais da **Pagou API v2**.

Este repositório é uma referência prática que complementa a [documentação oficial](https://developer.pagou.ai/)
e a especificação OpenAPI. Ele **não** é um SDK e **não** é acoplado a nenhum framework — cada exemplo
usa um cliente HTTP idiomático com o mínimo de dependências, para que os mesmos padrões de integração
se traduzam entre as linguagens.

> **Status: beta.** Os fluxos estão sendo implementados linguagem por linguagem. Consulte a
> [matriz de cobertura](docs/coverage-matrix.md) para ver o que já está disponível.

English: [README.md](README.md)

## O que está coberto

Cada linguagem espelha o mesmo conjunto de fluxos principais:

- **Pagamentos** — criar uma cobrança Pix e retornar o `pix.qr_code`; consultar e reconciliar uma
  transação; voucher/boleto com instruções assíncronas; cartão via Payment Element (navegador)
  → token `pgct_*` → backend, continuando o 3DS em `next_action`; estorno total e parcial; listar
  transações com paginação por cursor.
- **Links de checkout** — criar um link e armazenar o identificador público retornado.
- **Clientes e assinaturas** — criar/reutilizar um cliente; criar, consultar e cancelar uma
  assinatura; tratar eventos de renovação, falha, atraso e cancelamento.
- **Transferências (Pix Out)** — criar, consultar e reconciliar uma transferência; cancelar quando o
  status permitir; chegar ao estado final via webhook.
- **Webhooks** — handlers reais para as famílias de eventos de transação, assinatura e transferência.

## Linguagens

| Linguagem | Diretório |
| --- | --- |
| TypeScript / Node | [`typescript/`](typescript/) |
| Python | [`python/`](python/) |
| PHP | [`php/`](php/) |
| Java | [`java/`](java/) |
| C# / .NET | [`dotnet/`](dotnet/) |
| Go | [`go/`](go/) |
| Ruby | [`ruby/`](ruby/) |

## Das credenciais de sandbox à primeira execução

Todos os exemplos rodam contra o **sandbox** por padrão. Você nunca precisa de credenciais de produção
para experimentar este repositório.

1. **Obtenha um token de sandbox.** Acesse seu painel Pagou e crie um token de API de sandbox. Tokens
   de sandbox e de produção são separados — mantenha-os assim.
2. **Escolha uma linguagem e um fluxo.** Abra o diretório da linguagem (por exemplo
   [`typescript/`](typescript/)) e leia o `README.md`.
3. **Configure o ambiente.** Copie `.env.example` para `.env` no diretório da linguagem e defina seu
   token de sandbox. A URL base aponta para o servidor de sandbox por padrão:

   | Ambiente | URL base |
   | --- | --- |
   | Sandbox | `https://api.sandbox.pagou.ai` |
   | Produção | `https://api.pagou.ai` |

4. **Execute um fluxo.** Cada README de fluxo documenta um único comando de execução, o payload de
   entrada, a resposta relevante e o erro esperado com o caminho de recuperação.

Uma verificação mínima — listar transações para confirmar a autenticação e o caminho de rede:

```bash
curl --request GET \
  --url https://api.sandbox.pagou.ai/v2/transactions \
  --header "Authorization: Bearer SEU_TOKEN_DE_SANDBOX"
```

Uma resposta `200` indica que suas credenciais e o ambiente estão prontos.

## Autenticação

Todas as rotas v2 exigem autenticação. Escolha **um** esquema e use-o de forma consistente:

- `Authorization: Bearer <token>` (padrão recomendado)
- cabeçalho `apiKey: <token>`
- Basic auth com usuário `token` e senha `x`

A chave de API é um segredo **do servidor**. Ela nunca é lida em código de navegador. Dados de cartão
são capturados apenas pelo Payment Element / Elements e trocados por um token `pgct_*` antes de chegar
ao seu backend — nenhum exemplo aceita PAN ou CVV diretamente.

## Invariantes de segurança

Estas regras são verificadas no CI e não são negociáveis:

- Nenhuma chave, token, documento, PAN ou CVV real é comitado. `.env.example` contém apenas placeholders.
- A chave de API nunca é lida em código de navegador.
- Dados de cartão usam apenas o Payment Element / Elements → token `pgct_*`.
- Todas as fixtures são sintéticas.
- Logs ocultam `Authorization`, tokens e payloads sensíveis.
- Apenas o `identifier` UUID público retornado pela API é usado para referenciar recursos.

Consulte [SECURITY.md](SECURITY.md) para saber como reportar uma vulnerabilidade.

## Estrutura do repositório

```
/
  README.md  README.pt-BR.md  LICENSE  SECURITY.md  CONTRIBUTING.md  CODEOWNERS
  .github/    workflows, templates de issue, template de PR, configuração do dependabot
  docs/       coverage-matrix.md, architecture.md, troubleshooting.md
  shared/     fixtures/ (sintéticas), contracts/ (snapshot do OpenAPI + manifesto de operações usadas)
  typescript/ python/ php/ java/ dotnet/ go/ ruby/
```

Cada diretório de linguagem compartilha a mesma estrutura conceitual:

```
<linguagem>/
  README.md   .env.example
  payments/   checkout-links/   subscriptions/   transfers/   webhooks/   tests/
```

## Contribuindo

Contribuições são bem-vindas. Leia [CONTRIBUTING.md](CONTRIBUTING.md) primeiro — ele explica o fluxo de
branch e PR, o requisito da matriz de cobertura e as verificações de segurança que toda mudança precisa
passar.

## Licença

[MIT](LICENSE)
