# Jon Snow — Controle de banhos

App simples (PWA) para o Gabriel documentar os banhos do Jon Snow no pet shop: pacotes de 4 banhos, validade de 2 meses a partir do primeiro, histórico, foto e exportação para conferir com o pet shop.

**App:** https://gabstv.github.io/jon-snow-banhos/

## Como registrar um banho

Os três jeitos abrem a mesma tela de confirmação (para não registrar duas vezes sem querer):

| Método | URL |
| --- | --- |
| Código QR | https://gabstv.github.io/jon-snow-banhos/?registrar=1&origem=qr |
| Tag NFC | https://gabstv.github.io/jon-snow-banhos/?registrar=1&origem=nfc |
| Atalho / link | https://gabstv.github.io/jon-snow-banhos/?registrar=1&origem=link |

- **QR:** na seção *Mais → Código QR* há o código para imprimir (também em [`qrcode.png`](qrcode.png)).
- **NFC:** grave a URL acima como registro NDEF do tipo URL/URI. No iPhone, o app grátis *NFC Tools* faz isso; ao aproximar o aparelho da tag, o sistema abre o link sozinho. No Chrome para Android, o próprio app pode gravar a tag (Web NFC).
- **Atalho:** copie o link e crie um atalho no app *Atalhos* do iPhone (ação *Abrir URLs*), ou adicione o app à Tela de Início e use o botão *Registrar banho*.

A origem (QR, NFC, atalho ou app) fica salva em cada banho e aparece no histórico e na planilha CSV.

## Pacotes

Por padrão, cada pacote tem 4 banhos e vale 2 meses a partir do **primeiro** banho. O app mostra quantos já foram usados, quantos restam, a data de validade e um aviso quando o prazo está perto de acabar ou já venceu.

Em cada pacote dá para anexar um **comprovante de pagamento** (PNG ou JPEG), com valor e data opcionais. A imagem fica no aparelho, em qualidade alta o bastante para ler os dados. Dá para ver em tamanho real, baixar ou compartilhar. Isso entra no backup JSON e aparece na planilha CSV (colunas Comprovante, Valor pago e Data do pagamento).

Na primeira abertura, o pacote atual é criado com o 1º banho em 14/11/2026 às 12:00 (horário de Brasília), com a observação “Primeiro banho do pacote”, como na planilha.

## Dados e backup

Tudo fica **só neste aparelho e neste navegador** (localStorage para os registros, IndexedDB para as fotos). Nada é enviado a um servidor.

- Exporte uma planilha CSV (Excel, UTF-8, separado por `;`) para bater com o pet shop.
- Faça um backup JSON de vez em quando (inclui as fotos) e restaure se trocar de celular ou limpar os dados.

**No iPhone:** o Safari e o ícone da Tela de Início podem ter armazenamentos separados. Abra sempre do mesmo lugar (o recomendado é *Compartilhar → Adicionar à Tela de Início* e usar só esse ícone).

## Uso offline

O app é um PWA: depois da primeira visita, funciona offline. No iPhone, adicione à Tela de Início para abrir em tela cheia.

## Desenvolvimento

Site estático, sem etapa de build. Qualquer servidor local serve:

```bash
python3 -m http.server 8080
```

Depois abra `http://localhost:8080/`.
