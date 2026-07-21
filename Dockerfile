# --- Estágio de Compilação (Build) ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copia os arquivos de definição de pacotes
COPY package*.json ./

# Instala todas as dependências (inclusive devDependencies para compilação)
RUN npm ci

# Copia o restante dos arquivos do projeto
COPY . .

# Compila o frontend com o Vite e o backend com o esbuild
RUN npm run build

# --- Estágio de Execução (Production) ---
FROM node:20-alpine

WORKDIR /app

# Copia apenas os arquivos de dependência
COPY package*.json ./

# Instala apenas as dependências de produção para manter a imagem leve
RUN npm ci --only=production

# Copia os arquivos gerados no estágio anterior
COPY --from=builder /app/dist ./dist

# Expõe a porta 3000 do container
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Comando para iniciar o servidor
CMD ["npm", "start"]
