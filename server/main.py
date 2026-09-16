from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, Dict, Any

app = FastAPI(title="Nazar Cloud / Server Fallback", version="1.0")
security = HTTPBearer()

def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(security)):
    # Simple validation for now
    if not credentials.credentials:
        raise HTTPException(status_code=401, detail="Invalid NAZAR_API_KEY")
    return credentials.credentials

class ScreenPayload(BaseModel):
    image: str

class PVSRedactionPayload(BaseModel):
    schema_version: str = "nazar/pvs-redact/1.0"
    task: str
    screen: Optional[ScreenPayload] = None
    semantic_tree: Dict[str, Any]
    policy: Dict[str, bool]

class ActionResponse(BaseModel):
    action: str
    target: Optional[str] = None
    value: Optional[str] = None
    confidence: Optional[float] = None

@app.post("/v1/act", response_model=ActionResponse)
async def act_endpoint(payload: PVSRedactionPayload, token: str = Depends(verify_api_key)):
    """
    1. PVS Schema Validator
    2. Sanitized-context processor
    3. Open-weight VLM escalation
    4. Output safety validator
    """
    
    # Fail closed if policy isn't strictly adhered to
    if not payload.policy.get("strict") or not payload.policy.get("residual_scan_passed"):
        raise HTTPException(status_code=403, detail="Payload failed strict privacy policy.")

    # TODO: Pass payload to VisionAgentBackend
    
    return ActionResponse(action="done")

@app.get("/health")
async def health_check():
    return {"status": "ok"}
