from pydantic import BaseModel, Field


class OptimalBody(BaseModel):
    """body ของ PUT .../optimal — null = ลบค่าที่กรอกไว้ กลับไปใช้ค่าในไฟล์"""

    optimal: float | None = Field(default=None, gt=0)
