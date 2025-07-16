import { Request, Response, NextFunction } from "express";
import prisma from "../Connection/prisma";
import { setResponse } from "../DTO";

export const saveUser = async (req: Request, res: Response, next: NextFunction) => {
    try{
        const username = await prisma.users.findUnique({
            where: {
                username:req.body.username
            }
        })
        if(username){
            res.status(409).send(setResponse(res.statusCode, "username already exists", []));
        }

        const email = await prisma.users.findUnique({
            where: {
                email: req.body.email
            }
        })
        if(email){
            res.status(409).send(setResponse(res.statusCode, "email already exists", []));
        }

        next();
    }
    catch(error){
        res.status(500).send(setResponse(res.statusCode, "Error creating user",[]));
    }    
}

