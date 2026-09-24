import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EquationsModule } from './equations/equations.module';
import { ModelsModule } from './models/models.module';

@Module({
  imports: [
    // Загружаем .env файл и делаем его доступным во всем приложении
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Настраиваем подключение к PostgreSQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5432),
        username: configService.get('DB_USER', 'epid_user'),
        password: configService.get('DB_PASSWORD', 'epid_pass'),
        database: configService.get('DB_NAME', 'epid_db'),
        autoLoadEntities: true,
        synchronize: true, // Только для разработки! В продакшене использовать миграции
      }),
      inject: [ConfigService],
    }),
    EquationsModule, // Добавили модуль
    ModelsModule, // Модуль структурированных моделей эпидемии (этап 0)
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
