import { ApiError } from "../Errors/APIErrors.js";
import { APIResponse }from "../APIStatuses/APIResponse.js";
import { asyncHandler } from "../AsyncHandler/AsyncHandler.js";

const healthCheck = asyncHandler(async (req, res) => {
try {
        res.status(200).json(new APIResponse(200, { message: "Server is running" }));   
 } catch (error) {
          res.status(500).json(ApiError);    
 }   
}
);

export { healthCheck };