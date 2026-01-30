import { Request, Response, NextFunction } from 'express';

interface RequiredHeader {
  key: string;
  label: string;
}

const REQUIRED_HEADERS: RequiredHeader[] = [
  { key: 'x-rw-device-id', label: 'X-RW-Device-ID' },
  { key: 'x-rw-client-id', label: 'X-RW-Client-ID' },
  { key: 'x-rw-request-id', label: 'X-RW-Request-ID' },
  { key: 'x-rw-session-id', label: 'X-RW-Session-ID' },
  { key: 'x-rw-correlation-id', label: 'X-RW-Correlation-ID' },
  { key: 'x-rw-forwarded-proto', label: 'X-RW-Forwarded-Proto' },
  { key: 'x-rw-forwarded-port', label: 'X-RW-Forwarded-Port' },
  { key: 'x-forwarded-for', label: 'X-Forwarded-For' },
  { key: 'user-agent', label: 'User-Agent' },
  { key: 'content-type', label: 'Content-Type' },
  { key: 'connection', label: 'Connection' },
  { key: 'accept', label: 'Accept' },
  { key: 'host', label: 'Host' },
  { key: 'date', label: 'Date' }
];

export const validateMpcHeaders = (req: Request, res: Response, next: NextFunction): void => {
  const missingHeaders = REQUIRED_HEADERS.filter(header => !req.headers[header.key]);

  if (missingHeaders.length > 0) {
    res.status(412).json({
      result: 'error',
      code: 'HEADER_VALIDATION_ERROR',
      msg: 'header validation error',
      errors: missingHeaders.map(header => ({
        code: 'REQUIRED_HEADER_MISSING_ERROR',
        err_msg: `${header.label} header is required`
      }))
    });
    return;
  }

  // Validate session ID format (per requirement: "session id is invalid")
  const sessionId = req.headers['x-rw-session-id'] as string;
  if (sessionId && (!sessionId.trim() || sessionId.length < 1)) {
    res.status(400).json({
      result: 'error',
      code: 'VALIDATION_ERROR',
      msg: 'validation error',
      errors: [{
        code: 'INVALID_INPUT_ERROR',
        err_msg: 'session id is invalid'
      }]
    });
    return;
  }

  next();
};

