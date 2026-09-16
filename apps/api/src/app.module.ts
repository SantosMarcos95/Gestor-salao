import { Controller, Get, Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Database } from './database';
import { CashController } from './finance/cash';
import { CommissionsController } from './finance/commissions';
import { AuthController, AuthService, SessionGuard } from './auth/auth';
import { ClientsController } from './clients/clients';
import { AuditController } from './audit/audit';
import { AccessController } from './access/access';
import { ProfessionalsController } from './catalog/professionals';
import { AvailabilityController } from './availability/availability';
import { AppointmentsController } from './appointments/appointments';
import { PaymentsController } from './finance/payments';
import { FinanceController } from './finance/finance';
import { ReceiptsReportController } from './reports/receipts';
import { StockReportController } from './reports/stock';
import { OccupancyController } from './reports/occupancy';
import { ReportsController } from './reports/reports';
import { DashboardController } from './dashboard/dashboard';
import { OrdersController } from './orders/orders';
import { VisitsController } from './orders/visits';
import { ProductsController } from './inventory/inventory';
import { SuppliersController } from './inventory/suppliers';
import { ServicesController } from './catalog/services';

@Global()
@Module({ providers: [Database], exports: [Database] })
class DatabaseModule {}

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [SessionGuard],
})
class AuthModule {}

@Module({ imports: [AuthModule], controllers: [ClientsController] })
class ClientsModule {}

@Module({ imports: [AuthModule], controllers: [AuditController] })
class AuditModule {}

@Module({ imports: [AuthModule], controllers: [AccessController] })
class AccessModule {}

@Module({
  imports: [AuthModule],
  controllers: [
    ProfessionalsController,
    CashController,
    CommissionsController,
    ServicesController,
    ProductsController,
    OrdersController,
    PaymentsController,
    FinanceController,
    DashboardController,
    ReportsController,
    OccupancyController,
    StockReportController,
    ReceiptsReportController,
    VisitsController,
    SuppliersController,
    AvailabilityController,
    AppointmentsController,
  ],
})
class CatalogModule {}

@Controller('health')
class HealthController {
  constructor(private db: Database) {}
  @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ClientsModule,
    AuditModule,
    AccessModule,
    CatalogModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 180 }]),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
