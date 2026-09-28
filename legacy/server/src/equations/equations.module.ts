import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EquationsController } from './equations.controller';
import { Equation } from './equation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Equation])],
  controllers: [EquationsController],
})
export class EquationsModule {}
