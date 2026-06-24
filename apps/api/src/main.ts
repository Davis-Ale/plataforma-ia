import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefixo global da API
  app.setGlobalPrefix(process.env.API_PREFIX || "api/v1");

  // Validação global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  const productionOrigins = [process.env.WEB_URL, process.env.ADMIN_URL].filter(
    (origin): origin is string => Boolean(origin),
  );

  app.enableCors({
    origin: process.env.NODE_ENV === "production" ? productionOrigins : true,
    credentials: true,
  });

  // Swagger (só em dev)
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Plataforma IA API")
      .setDescription("API da plataforma de automação com IA")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, document);
  }

  const port = process.env.API_PORT || 3000;
  await app.listen(port);

  console.log("");
  console.log("API rodando em http://localhost:" + port);
  console.log("Docs em http://localhost:" + port + "/docs");
  console.log("Health em http://localhost:" + port + "/api/v1/health");
  console.log("");
}

bootstrap();
