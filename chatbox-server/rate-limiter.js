// rate-limiter.js - Rate limiting para proteger APIs y costos
const rateLimit = require('express-rate-limit');

/**
 * Rate limiter general para todas las rutas
 * 100 requests por 15 minutos por IP
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutos
    max: 100,                   // 100 requests
    message: {
        error: 'Demasiadas solicitudes. Por favor espera 15 minutos.',
        retryAfter: '15 minutos'
    },
    standardHeaders: true,      // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,       // Disable `X-RateLimit-*` headers
    handler: (req, res) => {
        console.log(`⚠️ Rate limit excedido: ${req.ip}`);
        res.status(429).json({
            error: 'Demasiadas solicitudes',
            message: 'Has excedido el límite de 100 consultas por 15 minutos. Por favor espera.',
            retryAfter: '15 minutos'
        });
    }
});

/**
 * Rate limiter para búsquedas (más restrictivo)
 * 50 requests por 15 minutos
 */
const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: {
        error: 'Demasiadas búsquedas. Por favor espera antes de continuar.',
        retryAfter: '15 minutos'
    },
    handler: (req, res) => {
        console.log(`⚠️ Search rate limit excedido: ${req.ip}`);
        res.status(429).json({
            error: 'Límite de búsquedas excedido',
            message: 'Has realizado demasiadas búsquedas. Espera 15 minutos.',
            retryAfter: '15 minutos'
        });
    }
});

/**
 * Rate limiter para IA (muy restrictivo para controlar costos)
 * 20 requests por hora
 */
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hora
    max: 20,                     // 20 requests
    message: {
        error: 'Límite de consultas IA alcanzado',
        retryAfter: '1 hora'
    },
    handler: (req, res) => {
        console.log(`⚠️ AI rate limit excedido: ${req.ip} - $$ Ahorro en costos`);
        res.status(429).json({
            error: 'Límite de IA alcanzado',
            message: 'Has usado tus 20 consultas de IA por hora. Las funciones básicas siguen disponibles.',
            retryAfter: '1 hora',
            alternative: 'Puedes seguir usando búsquedas sin IA'
        });
    }
});

/**
 * Rate limiter para análisis estadísticos (costosos en IA)
 * 10 requests por hora
 */
const analyticsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
        error: 'Límite de análisis estadísticos alcanzado',
        retryAfter: '1 hora'
    },
    handler: (req, res) => {
        console.log(`⚠️ Analytics rate limit excedido: ${req.ip}`);
        res.status(429).json({
            error: 'Límite de análisis alcanzado',
            message: 'Has usado tus 10 análisis estadísticos por hora.',
            retryAfter: '1 hora'
        });
    }
});

/**
 * Rate limiter para login/autenticación (prevenir brute force)
 * 5 intentos por 15 minutos
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,  // No contar logins exitosos
    message: {
        error: 'Demasiados intentos de login',
        retryAfter: '15 minutos'
    },
    handler: (req, res) => {
        console.log(`🚨 Auth brute force detectado: ${req.ip}`);
        res.status(429).json({
            error: 'Cuenta temporalmente bloqueada',
            message: 'Demasiados intentos de login. Espera 15 minutos o contacta al administrador.',
            retryAfter: '15 minutos'
        });
    }
});

/**
 * Rate limiter personalizado por usuario autenticado
 * Requiere req.user.id
 */
function createUserLimiter(maxRequests = 100, windowMinutes = 15) {
    const userLimits = new Map();
    
    return (req, res, next) => {
        // Si no hay usuario autenticado, usar IP
        const identifier = req.user?.id || req.ip;
        const now = Date.now();
        const windowMs = windowMinutes * 60 * 1000;
        
        if (!userLimits.has(identifier)) {
            userLimits.set(identifier, {
                count: 1,
                resetTime: now + windowMs
            });
            return next();
        }
        
        const userLimit = userLimits.get(identifier);
        
        // Reset si pasó la ventana
        if (now > userLimit.resetTime) {
            userLimit.count = 1;
            userLimit.resetTime = now + windowMs;
            return next();
        }
        
        // Incrementar contador
        userLimit.count++;
        
        // Verificar límite
        if (userLimit.count > maxRequests) {
            const minutesLeft = Math.ceil((userLimit.resetTime - now) / 60000);
            console.log(`⚠️ User rate limit: ${identifier} (${userLimit.count}/${maxRequests})`);
            
            return res.status(429).json({
                error: 'Límite de usuario excedido',
                message: `Has excedido tu límite de ${maxRequests} solicitudes. Espera ${minutesLeft} minutos.`,
                retryAfter: `${minutesLeft} minutos`,
                usage: {
                    current: userLimit.count,
                    limit: maxRequests
                }
            });
        }
        
        // Agregar headers informativos
        res.set('X-RateLimit-Limit', maxRequests);
        res.set('X-RateLimit-Remaining', maxRequests - userLimit.count);
        res.set('X-RateLimit-Reset', new Date(userLimit.resetTime).toISOString());
        
        next();
    };
}

/**
 * Middleware para mostrar uso de rate limit en headers
 */
function rateLimitInfo(req, res, next) {
    const originalJson = res.json;
    
    res.json = function(data) {
        // Agregar info de rate limit si está disponible
        if (req.rateLimit) {
            data._rateLimit = {
                limit: req.rateLimit.limit,
                remaining: req.rateLimit.remaining,
                reset: new Date(req.rateLimit.resetTime).toISOString()
            };
        }
        
        originalJson.call(this, data);
    };
    
    next();
}

/**
 * Obtener estadísticas de rate limiting
 */
function getRateLimitStats() {
    // Aquí podrías implementar tracking más detallado
    return {
        message: 'Rate limiting activo',
        limits: {
            general: '100 req/15min',
            search: '50 req/15min',
            ai: '20 req/hora',
            analytics: '10 req/hora',
            auth: '5 intentos/15min'
        }
    };
}

module.exports = {
    // Limiters predefinidos
    generalLimiter,
    searchLimiter,
    aiLimiter,
    analyticsLimiter,
    authLimiter,
    
    // Funciones personalizadas
    createUserLimiter,
    rateLimitInfo,
    getRateLimitStats
};
