from abc import ABC, abstractmethod
from pydantic import BaseModel
import os

class Action(BaseModel):
    action: str
    target: str = None
    value: str = None

class VisionAgentBackend(ABC):
    """
    Abstract interface ensuring the server remains model-agnostic.
    """
    
    def __init__(self):
        self.model_name = os.getenv("MODEL_NAME", "default-vlm")
        self.model_path = os.getenv("MODEL_PATH", "/models/default")
        self.quantization = os.getenv("QUANTIZATION", "int4")
        self.max_tokens = int(os.getenv("MAX_TOKENS", "1024"))

    @abstractmethod
    async def act(self, request_payload: dict) -> Action:
        """
        Process the sanitized request payload and return a structured action.
        """
        pass

class QwenVLBackend(VisionAgentBackend):
    async def act(self, request_payload: dict) -> Action:
        # Example implementation for Qwen-VL family
        return Action(action="done")
