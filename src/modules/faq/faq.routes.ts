import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permissions.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";

type Faq = RowDataPacket & { id:number; category_ar:string; category_en:string|null; question_ar:string; question_en:string|null; answer_ar:string; answer_en:string|null; display_order:number; active:boolean; created_at:Date; updated_at:Date };
const map=(f:Faq)=>({id:f.id,categoryAr:f.category_ar,categoryEn:f.category_en,questionAr:f.question_ar,questionEn:f.question_en,answerAr:f.answer_ar,answerEn:f.answer_en,displayOrder:f.display_order,active:Boolean(f.active),createdAt:f.created_at,updatedAt:f.updated_at});
const faqId=(raw:string)=>{const id=Number(raw);if(!Number.isInteger(id)||id<1)throw new ApiError(422,"VALIDATION_ERROR","Invalid FAQ id");return id;};

const clean=(b:Record<string,unknown>)=>{
  const s=(v:unknown,n:string,needed=true,max=500)=>{
    if(v===undefined||v===null||v===""){if(!needed)return null;throw new ApiError(422,"VALIDATION_ERROR",`${n} is required`)}
    if(typeof v!=="string"||v.length>max)throw new ApiError(422,"VALIDATION_ERROR",`Invalid ${n}`);
    return v.trim();
  };
  const order=Number(b.displayOrder);
  if(!Number.isInteger(order)||order<0)throw new ApiError(422,"VALIDATION_ERROR","Invalid displayOrder");
  if(typeof b.active!=="boolean")throw new ApiError(422,"VALIDATION_ERROR","Invalid active flag");
  return [
    s(b.categoryAr,"categoryAr",true,150), s(b.categoryEn,"categoryEn",false,150),
    s(b.questionAr,"questionAr",true,500), s(b.questionEn,"questionEn",false,500),
    s(b.answerAr,"answerAr",true,5000), s(b.answerEn,"answerEn",false,5000),
    order, b.active,
  ];
};

const get=async(id:number)=>{const [r]=await pool.query<Faq[]>("SELECT * FROM faqs WHERE id=?",[id]);if(!r[0])throw new ApiError(404,"NOT_FOUND","FAQ not found");return r[0]};

export const publicFaqRouter=Router();
publicFaqRouter.get("/",asyncHandler(async(_req,res)=>{
  const [rows]=await pool.query<Faq[]>("SELECT * FROM faqs WHERE active=TRUE ORDER BY display_order,id");
  res.json({success:true,data:rows.map(map)});
}));

export const adminFaqRouter=Router();
adminFaqRouter.use(requireAuth);

adminFaqRouter.get("/",requirePermission("faq","view"),asyncHandler(async(_req,res)=>{
  const [rows]=await pool.query<Faq[]>("SELECT * FROM faqs ORDER BY display_order,id");
  res.json({success:true,data:rows.map(map)});
}));

adminFaqRouter.post("/",requirePermission("faq","create"),asyncHandler(async(req,res)=>{
  const values=clean(req.body??{});
  const [r]=await pool.query<ResultSetHeader>(
    "INSERT INTO faqs (category_ar,category_en,question_ar,question_en,answer_ar,answer_en,display_order,active) VALUES (?,?,?,?,?,?,?,?)",
    values
  );
  res.status(201).json({success:true,data:map(await get(r.insertId))});
}));

adminFaqRouter.put("/:id",requirePermission("faq","edit"),asyncHandler(async(req,res)=>{
  const values=clean(req.body??{}), id=faqId(String(req.params.id));
  await get(id);
  await pool.query(
    "UPDATE faqs SET category_ar=?,category_en=?,question_ar=?,question_en=?,answer_ar=?,answer_en=?,display_order=?,active=? WHERE id=?",
    [...values,id]
  );
  res.json({success:true,data:map(await get(id))});
}));

adminFaqRouter.delete("/:id",requirePermission("faq","delete"),asyncHandler(async(req,res)=>{
  const id=faqId(String(req.params.id));
  const [r]=await pool.query<ResultSetHeader>("DELETE FROM faqs WHERE id=?",[id]);
  if(!r.affectedRows)throw new ApiError(404,"NOT_FOUND","FAQ not found");
  res.json({success:true,data:{id}});
}));
