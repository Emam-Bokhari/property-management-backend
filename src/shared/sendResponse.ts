import { Response } from "express";

type IData<T> = {
  success: boolean;
  statusCode: number;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    totalPage: number;
    total: number;
    hasNextPage?: boolean;
    hasPrevPage?: boolean;
  };
  data?: T;
  meta?: any;
  stats?: any;
};

const sendResponse = <T>(res: Response, data: IData<T>) => {
  const resData: Record<string, any> = {
    success: data.success,
    message: data.message,
    pagination: data.pagination,
    data: data.data,
    meta: data.meta,
  };
  if (data.stats !== undefined) {
    resData.stats = data.stats;
  }
  res.status(data.statusCode).json(resData);
};

export default sendResponse;
