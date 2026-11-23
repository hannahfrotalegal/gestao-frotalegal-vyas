# Gestão Frota Legal · Grupo Vyas

Painel web (GitHub Pages + Firebase) que replica o Power BI "Gestão Frota Legal" do Grupo Vyas, com:

- login por e-mail e senha;
- envio das bases **Prontuário de Condutores** (DPO e SDPO) pelo próprio painel;
- cadastro de usuários com acesso por **ambiente × filial**.

> **Nenhum dado de condutor fica neste repositório.** Os dados ficam só no Firestore, protegidos pelo login e pelas regras do banco. O CPF não é gravado: o painel guarda apenas um código embaralhado, usado para reconhecer o mesmo condutor de uma base para outra.

## Estrutura

| Arquivo | Para quê |
|---|---|
| `index.html` | página do painel |
| `css/style.css` | visual |
| `js/config.js` | **único arquivo a editar**: configuração do Firebase e e-mails master |
| `js/store.js` | acesso ao Firebase (ou memória, no modo demonstração) |
| `js/processa.js` | leitura das planilhas e gravação no banco (foto atual, histórico mensal, ocorrências) |
| `js/app.js` | telas, filtros, Usuários e Bases |
| `firestore.rules` | regras de segurança do banco (colar no Console do Firebase) |
| `img/` | logos |

Enquanto o `apiKey` do `config.js` começar com `COLE`, o painel abre em **modo demonstração**. Nesse modo qualquer e-mail entra e nada é gravado.

## Passo a passo da configuração (uma vez só)

### 1. Firebase
1. Acesse https://console.firebase.google.com e clique em **Adicionar projeto**.
   - Nome: `gestao-frota-vyas`.
   - Pode desativar o Google Analytics.
   - O plano é o **Spark** (gratuito).
2. Ative o login:
   - Vá em **Authentication › Começar › Método de login › E-mail/senha** e ative.
   - Em **Authentication › Usuários › Adicionar usuário**, crie o login dos e-mails master com uma senha.
3. Crie o banco:
   - Vá em **Firestore Database › Criar banco de dados** e escolha o **modo de produção**.
   - Local: `southamerica-east1 (São Paulo)`.
4. Publique as regras: em **Firestore › Regras**, apague o conteúdo, cole o arquivo `firestore.rules` inteiro e clique em **Publicar**.
5. Pegue a configuração do app:
   - Vá em **⚙ Configurações do projeto › Seus apps** e clique no ícone **Web (`</>`)**.
   - Registre o app com o apelido `painel` (não precisa do Hosting).
   - Copie os valores do bloco `firebaseConfig` para `js/config.js`.
6. Libere o domínio: em **Authentication › Configurações › Domínios autorizados**, adicione `hannahfrotalegal.github.io`.
7. (Opcional) Traduza os e-mails de senha: em **Authentication › Modelos**, escolha o idioma **Português (Brasil)**.

### 2. GitHub
1. Na conta `hannahfrotalegal`, crie o repositório **`gestao-frota-vyas`**.
   - Ele precisa ser público para o Pages gratuito. Isso não expõe dados, porque eles não ficam no repositório.
2. Envie todos os arquivos desta pasta (**Add file › Upload files**), mantendo as pastas `css`, `js` e `img`.
3. Ative o site: em **Settings › Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
4. Em 1 a 2 minutos o painel estará em: https://hannahfrotalegal.github.io/gestao-frota-vyas/

### 3. Primeira carga
1. Entre com um e-mail master.
2. Vá em **Administração › Bases** e envie **todos os arquivos históricos e os de hoje juntos**.
3. Confira a tabela de conferência e clique em **Publicar no painel**.
4. Vá em **Administração › Usuários** e cadastre as pessoas:
   - defina a senha inicial;
   - escolha o perfil;
   - escolha os ambientes e as filiais de cada uma.

## Uso diário
Em **Administração › Bases**, envie os dois arquivos do dia (DPO e SDPO) e clique em **Publicar no painel**.

- Uma base igual ou mais antiga que a já carregada é ignorada.
- Para refazer o histórico desde o início, marque **Reconstruir o histórico do zero** e envie todas as bases juntas.

## Regras de cálculo
- **N/A** (não aplicável) e **NO** (não obrigatório) ficam fora de toda a aderência documental.
- **100% aderente:** todos os documentos aplicáveis estão OK.
- **Vencido:** validade anterior à data de geração da base.
- **Vencendo:** validade nos próximos 30 dias.
- **Pendentes:** NOK (ausente ou vencido) + AV (aguardando validação).
- **Reprovados:** RV.
- **Bloqueados só por documentação:** status Bloqueado com motivo de documento.
- **Bloqueados só por faixa:** motivo "Bloqueio por faixa" e nenhum documento pendente, vencido ou reprovado.
- **Ocorrências:**
  - cada base traz os últimos 60 dias;
  - a base nova substitui esse período no histórico, sem duplicar;
  - o que é mais antigo continua guardado;
  - ocorrências "mensal vencida" (peso 0) contam na quantidade.
- **Evolução:**
  - cada mês mostra a última base do mês;
  - uma base gerada nos dias 1 a 3 conta como fechamento do mês anterior quando é a primeira base do mês;
  - a **Data Mudança** é preenchida quando a faixa muda entre duas bases com até 7 dias de diferença (uploads diários).
- **Bases anteriores à separação DPO/SDPO:**
  - cada condutor vai para o ambiente em que aparece nas bases mais recentes;
  - quem já saiu é classificado pelo cargo: Vendedor, Coordenador de Operações e Administrativo vão para SDPO; os demais, para DPO.
- **Cadastros de teste** (matrícula "teste") e as ocorrências deles são ignorados.

## Remover acesso
- **Desativar** ou **Remover** um usuário corta o acesso imediatamente.
- O login (e-mail/senha) continua existindo no Firebase. Para apagá-lo, vá em **Authentication › Usuários**.
