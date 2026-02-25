import logger from "../loggers/logger.js";

/**
 *
 * @param {(req: import("express").Request, res:import("express").Response, next:import("express").NextFunction) => void} requestHandler
 */
const asyncHandler = (requestHandler) => {
    return (req,res,next) => {
        Promise.resolve(requestHandler(req,res,next))
        .catch((err)=>next(err)).then((errors)=>{if (errors) logger.warn("AsyncHandler resolved after error forwarding:", errors);});
    } 
}
export { asyncHandler }