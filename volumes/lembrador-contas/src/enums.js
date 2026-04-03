export const PeriodFilterEnum = {
    CURRENT_AND_FUTURE: 'Mês atual e futuros',
    ALL: 'Todos'
}

export const StatusEnum = {
    ACTIVE: 'Ativo',
    INACTIVE: 'Inativo'
}

export const HttpMethodEnum = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE'
}

export const ValueSourceTypeEnum = {
    TABLE: 'Tabela',
    EMAIL: 'Email',
    API: 'API'
}

export const BillTypeEnum = {
    RECURRENT_SERVICE: 'Serviço Recorrente',
    PURCHASE: 'Compra',
}

export const PaymentTypeEnum = {
    PIX: 'PIX',
    DINHEIRO: 'Dinheiro'
}

export const ActiveBillStatusEnum = {
    UNPAID: 'Não pago',
    PAID: 'Pago',
    ERROR: 'Erro'
}

export const DataTypeEnum = {
    BODY: 'Corpo do email',
    PDF_ATTACHMENT: 'Anexo PDF'
}

export const DataParserEnum = {
    CPFL_EMAIL: 'cpflEmailParser',
    CORSAN_EMAIL: 'corsanEmailParser'
}

export const ReminderStatusEnum = {
    CREATED: 'Criado',
    PAYD: 'Pago',
    CANCELED: 'Cancelado'
}
