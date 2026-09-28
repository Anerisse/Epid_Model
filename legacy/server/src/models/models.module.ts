import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelsController } from './models.controller';
import { Model } from './model.entity';

/**
 * Модуль моделей эпидемии.
 *
 * Собран по образцу модуля equations/ (см. AGENTS.md):
 * - TypeOrmModule.forFeature([Model]) регистрирует сущность Model,
 *   чтобы TypeORM создал таблицу models в базе и позволил внедрять
 *   её репозиторий в контроллер;
 * - ModelsController описывает эндпоинты /api/models.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Model])],
  controllers: [ModelsController],
})
export class ModelsModule {}
